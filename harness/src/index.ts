#!/usr/bin/env node
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadTasks } from "./tasks.js";
import { runAgent } from "./agent.js";
import { verify } from "./verify.js";
import { classifyFailure } from "./classifier.js";
import { summarize, writeRunResult } from "./report.js";
import { costFor, emptyTokens } from "./cost.js";
import { currentSandboxMode } from "./sandbox.js";
import {
  DEFAULT_MODEL,
  DEFAULT_MAX_TURNS,
  DEFAULT_TEMPERATURE,
  DEFAULT_ATTEMPTS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  HARNESS_VERSION,
  pricingForModel,
} from "./config.js";
import type {
  AttemptResult,
  Pricing,
  RunConfig,
  RunResult,
  TaskResult,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

interface Args {
  [k: string]: string | boolean | undefined;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function num(v: string | boolean | undefined, fallback: number): number {
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return fallback;
}

async function main() {
  const [, , subcommand, ...rest] = process.argv;
  if (subcommand !== "run") {
    console.log(
      `ForwardEval harness v${HARNESS_VERSION}\n\n` +
        `Usage:\n` +
        `  tsx src/index.ts run [options]\n\n` +
        `Options:\n` +
        `  --model <id>            Agent model (default ${DEFAULT_MODEL})\n` +
        `  --max-turns <n>         Max agent turns per task (default ${DEFAULT_MAX_TURNS})\n` +
        `  --temperature <t>       Sampling temperature (default ${DEFAULT_TEMPERATURE})\n` +
        `  --attempts <k>          Attempts per task for pass@k (default ${DEFAULT_ATTEMPTS})\n` +
        `  --label <name>          Run label for comparison (default = model id)\n` +
        `  --only <id,id>          Only run these task ids\n` +
        `  --input-price <usd>     USD per 1M input tokens (Cost view)\n` +
        `  --output-price <usd>    USD per 1M output tokens (Cost view)\n` +
        `  --no-pricing            Disable the Cost view (Tokens only)\n` +
        `  --timeout <ms>          Sandbox timeout per test run (default ${DEFAULT_SANDBOX_TIMEOUT_MS})\n`,
    );
    process.exit(subcommand ? 1 : 0);
  }

  const args = parseArgs(rest);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ERROR: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.",
    );
    process.exit(1);
  }

  const model = (args.model as string) ?? DEFAULT_MODEL;
  const maxTurns = num(args["max-turns"], DEFAULT_MAX_TURNS);
  const temperature = num(args.temperature, DEFAULT_TEMPERATURE);
  const attempts = Math.max(1, num(args.attempts, DEFAULT_ATTEMPTS));
  const timeoutMs = num(args.timeout, DEFAULT_SANDBOX_TIMEOUT_MS);
  const label = (args.label as string) ?? model;

  let pricing: Pricing | null;
  if (args["no-pricing"]) {
    pricing = null;
  } else if (args["input-price"] || args["output-price"]) {
    const base = pricingForModel(model);
    pricing = {
      inputPerMTok: num(args["input-price"], base.inputPerMTok),
      outputPerMTok: num(args["output-price"], base.outputPerMTok),
    };
  } else {
    pricing = pricingForModel(model);
  }

  const tasksDir = (args["tasks-dir"] as string) ?? join(REPO_ROOT, "tasks");
  const resultsDir = (args["results-dir"] as string) ?? join(REPO_ROOT, "results");

  const onlyFilter = typeof args.only === "string" ? args.only.split(",") : null;

  const client = new Anthropic({ apiKey });
  let allTasks = await loadTasks(tasksDir);
  if (onlyFilter) {
    allTasks = allTasks.filter((t) => onlyFilter.includes(t.spec.id));
  }

  const sandboxMode = await currentSandboxMode();
  const runId = `${new Date().toISOString().slice(0, 10)}-${label}-${randomUUID().slice(0, 8)}`
    .replace(/[^a-zA-Z0-9-_.]/g, "_");

  const config: RunConfig = {
    model,
    temperature,
    maxTurns,
    attempts,
    pricing,
    label,
    harnessVersion: HARNESS_VERSION,
    verification: "confirmed",
    sandboxTimeoutMs: timeoutMs,
  };

  console.log(`\nForwardEval run: ${runId}`);
  console.log(`  model=${model} maxTurns=${maxTurns} attempts=${attempts} temp=${temperature}`);
  console.log(`  sandbox=${sandboxMode} pricing=${pricing ? "on" : "off"} tasks=${allTasks.length}\n`);

  const startedAt = new Date().toISOString();
  const taskResults: TaskResult[] = [];

  for (const { spec, dir, stubCode } of allTasks) {
    process.stdout.write(`• ${spec.id} [${spec.category}/${spec.difficulty}] ... `);
    const attemptResults: AttemptResult[] = [];

    for (let k = 0; k < attempts; k++) {
      const t0 = Date.now();
      const agentOut = await runAgent({
        client,
        task: spec,
        taskDir: dir,
        model,
        temperature,
        maxTurns,
        timeoutMs,
      });

      // Authoritative verification on a CLEAN task copy + the agent's final file.
      const finalTestOutput = await verify({
        taskDir: dir,
        testCommand: spec.test_command,
        timeoutMs,
        overlay: { [spec.entry_file]: agentOut.finalCode || stubCode },
      });

      const passed = finalTestOutput.exitCode === 0;
      const failureTags = passed
        ? []
        : await classifyFailure({
            client,
            model,
            taskPrompt: spec.prompt,
            transcript: agentOut.transcript,
            finalTestOutput,
          });

      const wallClockMs = Date.now() - t0;
      attemptResults.push({
        attempt: k,
        passed,
        turnsUsed: agentOut.turnsUsed,
        stopReason: agentOut.stopReason,
        tokens: agentOut.tokens,
        cost: costFor(agentOut.tokens, pricing),
        wallClockMs,
        finalTestOutput,
        failureTags,
        transcript: agentOut.transcript,
        finalCode: agentOut.finalCode,
      });
    }

    const passAt1 = attemptResults[0]?.passed ?? false;
    const passAtK = attemptResults.some((a) => a.passed);
    const repIdx = Math.max(
      0,
      attemptResults.findIndex((a) => a.passed),
    );
    const rep = attemptResults[repIdx] ?? attemptResults[0];

    taskResults.push({
      id: spec.id,
      title: spec.title,
      category: spec.category,
      difficulty: spec.difficulty,
      prompt: spec.prompt,
      entryFile: spec.entry_file,
      testCommand: spec.test_command,
      stubCode,
      passAt1,
      passAtK,
      representativeAttempt: repIdx,
      passed: rep.passed,
      turnsUsed: rep.turnsUsed,
      tokens: rep.tokens,
      cost: rep.cost,
      wallClockMs: rep.wallClockMs,
      failureTags: rep.failureTags,
      finalTestOutput: rep.finalTestOutput,
      finalCode: rep.finalCode,
      attempts: attemptResults,
    });

    console.log(passAt1 ? "PASS" : passAtK ? `pass@${attempts}` : "FAIL");
  }

  const finishedAt = new Date().toISOString();
  const summary = summarize(taskResults, config);
  const run: RunResult = {
    schemaVersion: 1,
    runId,
    startedAt,
    finishedAt,
    config,
    summary,
    tasks: taskResults,
  };

  const path = await writeRunResult(resultsDir, run);

  const c = summary.cost;
  console.log(`\n── Run summary ──────────────────────────────`);
  console.log(`  pass@1: ${summary.passedAt1}/${summary.totalTasks} (${(summary.passAt1Rate * 100).toFixed(1)}%)`);
  console.log(`  tokens: ${summary.tokens.total.toLocaleString()} (in ${summary.tokens.input.toLocaleString()} / out ${summary.tokens.output.toLocaleString()})`);
  if (c !== null) {
    console.log(`  cost:   $${c.toFixed(4)}   cost/solve: ${summary.costPerSolve !== null ? "$" + summary.costPerSolve.toFixed(4) : "n/a"}`);
  }
  console.log(`  tokens/solve: ${summary.tokensPerSolve.toLocaleString()}   wasted (on fails): ${summary.wastedTokens.toLocaleString()} tok`);
  console.log(`  avg turns-to-solve: ${summary.avgTurnsToSolve}`);
  console.log(`\nWrote ${path}`);
  console.log(`Next: run \`node scripts/sync-results.mjs\` then start the dashboard.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
