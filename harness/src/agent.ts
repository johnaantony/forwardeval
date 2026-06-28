import Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, basename } from "node:path";
import { runInSandbox } from "./sandbox.js";
import { addTokens, emptyTokens } from "./cost.js";
import { DEFAULT_HIDDEN_FILES } from "./types.js";
import type { TaskSpec, TranscriptItem, TokenUsage } from "./types.js";

/** Read the hidden (test) files from the real task dir, keyed by basename. */
async function readHiddenFiles(
  taskDir: string,
  hidden: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of hidden) {
    out[f] = await readFile(join(taskDir, f), "utf8").catch(() => "");
  }
  return out;
}

const MAX_TOKENS_PER_CALL = 8000;

const SYSTEM_PROMPT = `You are a coding agent working inside an automated evaluation harness.

You are given a single coding task and a working directory that contains a candidate file with a bug or a missing implementation. Your job is to make the task's tests pass by editing the candidate file.

You have three tools:
- read_file(path): read a file in the working directory.
- write_file(path, contents): OVERWRITE a file with new contents. Always write the COMPLETE file, never a diff or partial snippet.
- run_tests(): run the task's test command and see stdout/stderr/exit code.

Work like a careful engineer:
1. Read the candidate file and understand the current behavior.
2. Make a focused fix.
3. Call run_tests to check. Read the failures carefully.
4. Iterate until the tests pass. Do not break behavior that already worked.

Only edit the candidate entry file unless the task clearly requires otherwise. Do not edit the test files. When the tests pass, briefly state that you are done.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Read the full contents of a file in the working directory. Returns the file text.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the working directory.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Overwrite a file with new contents. Provide the COMPLETE file contents, not a diff.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the working directory." },
        contents: { type: "string", description: "The complete new file contents." },
      },
      required: ["path", "contents"],
    },
  },
  {
    name: "run_tests",
    description:
      "Run the task's test command in the sandbox and return stdout, stderr, and the exit code (0 means all tests passed).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export type StopReason =
  | "tests_passed"
  | "agent_done"
  | "turn_cap"
  | "error";

export interface AgentRunOutput {
  transcript: TranscriptItem[];
  turnsUsed: number;
  tokens: TokenUsage;
  stopReason: StopReason;
  finalCode: string; // contents of the entry file after the loop
}

/** Safely resolve a candidate-supplied path to inside the workspace. */
function safeJoin(workDir: string, p: string): string | null {
  const target = isAbsolute(p) ? p : join(workDir, p);
  const rel = relative(workDir, resolve(target));
  if (rel.startsWith("..") || isAbsolute(rel)) return null; // escape attempt
  return resolve(target);
}

/**
 * Run the agentic loop for a single task in a fresh, stateful workspace.
 * The harness performs file reads/writes directly (pure file IO, no code
 * execution); only run_tests executes code, and that goes through the sandbox.
 */
export async function runAgent(opts: {
  client: Anthropic;
  task: TaskSpec;
  taskDir: string;
  model: string;
  temperature: number;
  maxTurns: number;
  timeoutMs: number;
}): Promise<AgentRunOutput> {
  const { client, task, taskDir, model, temperature, maxTurns, timeoutMs } = opts;
  const hidden = task.hidden_files ?? DEFAULT_HIDDEN_FILES;
  const hiddenFiles = await readHiddenFiles(taskDir, hidden);
  const workDir = await mkdtemp(join(tmpdir(), "forwardeval-agent-"));
  const transcript: TranscriptItem[] = [];
  let tokens = emptyTokens();
  let stopReason: StopReason = "turn_cap";
  let turnsUsed = 0;

  try {
    // Copy the task into the agent workspace, EXCLUDING hidden test files.
    await cp(taskDir, workDir, {
      recursive: true,
      filter: (src) => !hidden.includes(basename(src)),
    });

    transcript.push({ type: "system", text: SYSTEM_PROMPT });

    const userIntro = [
      `# Task: ${task.title}`,
      ``,
      task.prompt,
      ``,
      `The candidate file is \`${task.entry_file}\`. The tests are run with: \`${task.test_command}\``,
      `Start by reading \`${task.entry_file}\`.`,
    ].join("\n");

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userIntro },
    ];
    transcript.push({ type: "assistant_text", text: `[task prompt delivered]` });

    for (let turn = 1; turn <= maxTurns; turn++) {
      turnsUsed = turn;

      let resp: Anthropic.Message;
      try {
        resp = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS_PER_CALL,
          temperature,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        });
      } catch (err) {
        transcript.push({
          type: "assistant_text",
          text: `[harness] API error on turn ${turn}: ${String(err)}`,
        });
        stopReason = "error";
        break;
      }

      tokens = addTokens(tokens, {
        input: resp.usage.input_tokens,
        output: resp.usage.output_tokens,
        total: resp.usage.input_tokens + resp.usage.output_tokens,
      });

      // record assistant text + tool_use blocks
      const toolUses: Anthropic.ToolUseBlock[] = [];
      for (const block of resp.content) {
        if (block.type === "text") {
          if (block.text.trim()) {
            transcript.push({ type: "assistant_text", text: block.text });
          }
        } else if (block.type === "tool_use") {
          toolUses.push(block);
          transcript.push({
            type: "tool_use",
            tool: block.name,
            input: block.input,
            toolUseId: block.id,
          });
        }
      }

      messages.push({ role: "assistant", content: resp.content });

      // Agent stopped calling tools => it considers itself done.
      if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
        stopReason = "agent_done";
        break;
      }

      // Execute each tool call, build tool_result blocks.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let testsPassedThisTurn = false;

      for (const tu of toolUses) {
        const { content, isError, passed } = await executeTool(
          tu,
          workDir,
          task,
          timeoutMs,
          hiddenFiles,
        );
        transcript.push({
          type: "tool_result",
          toolUseId: tu.id,
          tool: tu.name,
          content,
          isError,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content,
          is_error: isError,
        });
        if (tu.name === "run_tests" && passed) testsPassedThisTurn = true;
      }

      messages.push({ role: "user", content: toolResults });

      // Tests passed during the loop -> stop early (authoritative verify still runs).
      if (testsPassedThisTurn) {
        stopReason = "tests_passed";
        break;
      }
    }

    // Read final candidate code for verification + the diff view.
    let finalCode = "";
    const entryPath = safeJoin(workDir, task.entry_file);
    if (entryPath) {
      finalCode = await readFile(entryPath, "utf8").catch(() => "");
    }

    return { transcript, turnsUsed, tokens, stopReason, finalCode };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function executeTool(
  tu: Anthropic.ToolUseBlock,
  workDir: string,
  task: TaskSpec,
  timeoutMs: number,
  hiddenFiles: Record<string, string>,
): Promise<{ content: string; isError: boolean; passed?: boolean }> {
  const input = (tu.input ?? {}) as Record<string, unknown>;

  if (tu.name === "read_file") {
    const p = safeJoin(workDir, String(input.path ?? ""));
    if (!p) return { content: "Error: path escapes the workspace.", isError: true };
    try {
      const text = await readFile(p, "utf8");
      return { content: text, isError: false };
    } catch (e) {
      return { content: `Error reading file: ${String(e)}`, isError: true };
    }
  }

  if (tu.name === "write_file") {
    const p = safeJoin(workDir, String(input.path ?? ""));
    if (!p) return { content: "Error: path escapes the workspace.", isError: true };
    try {
      await writeFile(p, String(input.contents ?? ""), "utf8");
      return { content: `Wrote ${input.path}.`, isError: false };
    } catch (e) {
      return { content: `Error writing file: ${String(e)}`, isError: true };
    }
  }

  if (tu.name === "run_tests") {
    // Overlay the hidden test files onto a fresh copy of the agent's current
    // workspace and run there - the agent never sees the test source.
    const r = await runInSandbox({
      sourceDir: workDir,
      command: task.test_command,
      timeoutMs,
      overlay: hiddenFiles,
    });
    const passed = r.exitCode === 0;
    const body = [
      `exit_code: ${r.exitCode}${r.timedOut ? " (timed out)" : ""}`,
      `--- stdout ---`,
      r.stdout.slice(0, 8000) || "(empty)",
      `--- stderr ---`,
      r.stderr.slice(0, 8000) || "(empty)",
    ].join("\n");
    return { content: body, isError: false, passed };
  }

  return { content: `Unknown tool: ${tu.name}`, isError: true };
}
