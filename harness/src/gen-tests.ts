import Anthropic from "@anthropic-ai/sdk";
import { emptyTokens } from "./cost.js";
import type { TaskSpec, TokenUsage } from "./types.js";

/**
 * LLM test-suite author.
 *
 * Given only the task PROMPT and the candidate STUB (the public API), Claude
 * writes a deterministic Python `unittest` suite for the task. It never sees the
 * human expert's hidden suite, so the comparison is honest: we are measuring
 * whether an LLM, asked to think of the test cases, covers the same edge cases a
 * use-case expert does.
 *
 * This is NOT LLM-as-judge. The LLM writes tests up front; those tests then run
 * deterministically and their exit code is the verdict. The risk this surfaces
 * is exactly the one the expert worries about: the LLM may not THINK of the
 * unusual scenario, so its suite passes code the expert's suite would fail.
 */

const TEST_FILE_NAME = "test_suite_llm.py";

const genTool: Anthropic.Tool = {
  name: "emit_test_suite",
  description:
    "Return a complete, self-contained Python unittest test file for the task.",
  input_schema: {
    type: "object",
    properties: {
      test_code: {
        type: "string",
        description:
          "The full contents of a Python test file using the stdlib `unittest` module. " +
          "It must import the public API from the candidate module and end with " +
          "`if __name__ == \"__main__\": unittest.main()`. No third-party imports.",
      },
      reasoning: {
        type: "string",
        description:
          "One or two sentences on which behaviors and edge cases you chose to cover.",
      },
    },
    required: ["test_code"],
  },
};

export interface GeneratedTests {
  testFileName: string;
  testCommand: string;
  testCode: string;
  reasoning: string;
  tokens: TokenUsage;
}

/** Module name the test file should import from (entry_file without .py). */
function moduleName(entryFile: string): string {
  return entryFile.replace(/\.py$/i, "");
}

export async function generateLlmTests(opts: {
  client: Anthropic;
  model: string;
  task: TaskSpec;
  stubCode: string;
  temperature?: number;
}): Promise<GeneratedTests> {
  const { client, model, task, stubCode } = opts;
  const mod = moduleName(task.entry_file);

  const prompt = [
    `You are a meticulous test author. Write a deterministic Python \`unittest\` suite`,
    `for the coding task below. Think hard about EDGE CASES a domain expert would`,
    `insist on, not just the happy path: empty inputs, boundaries, unusual but valid`,
    `inputs, and anything the prompt implies but does not spell out.`,
    ``,
    `Rules:`,
    `- Use only the Python standard library (\`unittest\`). No pytest, no pip installs.`,
    `- Import the public API from the module \`${mod}\` (the candidate file is \`${task.entry_file}\`).`,
    `- Do NOT redefine or implement the solution yourself. Only test it.`,
    `- End the file with: if __name__ == "__main__": unittest.main()`,
    `- The suite must exit non-zero if any case fails (default unittest behavior).`,
    ``,
    `## Task`,
    `Title: ${task.title}`,
    `Category: ${task.category}  Difficulty: ${task.difficulty}`,
    ``,
    task.prompt,
    ``,
    `## Candidate stub (the public API you are testing; it contains a bug or gap)`,
    "```python",
    stubCode,
    "```",
    ``,
    `Call emit_test_suite with the complete test file.`,
  ].join("\n");

  let tokens = emptyTokens();
  let testCode = "";
  let reasoning = "";

  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 4000,
      temperature: opts.temperature ?? 0,
      tools: [genTool],
      tool_choice: { type: "tool", name: "emit_test_suite" },
      messages: [{ role: "user", content: prompt }],
    });
    tokens = {
      input: resp.usage.input_tokens,
      output: resp.usage.output_tokens,
      total: resp.usage.input_tokens + resp.usage.output_tokens,
    };
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "emit_test_suite") {
        const input = block.input as { test_code?: string; reasoning?: string };
        testCode = (input.test_code ?? "").trim();
        reasoning = input.reasoning ?? "";
      }
    }
  } catch (err) {
    // Fall through with an empty suite; caller treats an empty suite as a hard
    // error result so the run stays honest (no silent "pass").
    reasoning = `LLM test generation failed: ${String(err)}`;
  }

  if (!testCode) {
    // A minimal always-failing suite keeps the verdict deterministic and honest
    // when generation fails, rather than silently passing.
    testCode =
      "import unittest\n\n\n" +
      "class TestGenerationFailed(unittest.TestCase):\n" +
      "    def test_generation_failed(self):\n" +
      "        self.fail('LLM test generation produced no suite.')\n\n\n" +
      'if __name__ == "__main__":\n    unittest.main()\n';
  }

  return {
    testFileName: TEST_FILE_NAME,
    testCommand: `python3 ${TEST_FILE_NAME}`,
    testCode,
    reasoning,
    tokens,
  };
}
