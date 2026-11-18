#!/usr/bin/env node
/**
 * Where you are in the runbook, read from your files (RUNBOOK.md explains each step).
 *
 * Every step's state is derived from evidence on disk: the key in .env, the
 * task suite, real run files, outcomes.json. Nothing is ticked by hand, which
 * is the same rule the verdicts follow, and demo runs never count as your
 * evidence. Read-only: it never writes a file, calls an API, or runs a test.
 *
 * Usage:
 *   node scripts/runbook.mjs
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DONE = "done";
const PARTIAL = "in progress";
const TODO = "not started";
const ROUTINE_DAYS = 7;
const DAY_MS = 86_400_000;
// .env.example ships a placeholder key; a copied but unfilled file reads as unset.
const PLACEHOLDER_KEY = /^sk-ant-x+$/;

const step = (number, name, state, detail, next = null) => ({ number, name, state, detail, next });

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** KEY=VALUE pairs from a dotenv file, or null when there is none. Values are only tested for presence. */
function readEnv(path) {
  if (!existsSync(path)) return null;
  const values = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).replace(/^export\s+/, "").trim();
    values[key] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

/** Real runs, oldest first. Demo runs carry _demo and are never your evidence. */
function realRuns() {
  const dir = join(ROOT, "results");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => ({ file, run: readJson(join(dir, file), null) }))
    .filter(({ run }) => run && Array.isArray(run.tasks) && !run._demo)
    .sort((a, b) => String(a.run.finishedAt).localeCompare(String(b.run.finishedAt)));
}

function taskIds() {
  const dir = join(ROOT, "tasks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (d) => existsSync(join(dir, d, "task.json")) && existsSync(join(dir, d, "test_suite.py")),
  );
}

// ---- the eight steps --------------------------------------------------------

function connect() {
  const name = "Connect";
  const env = readEnv(join(ROOT, ".env"));
  const installed = existsSync(join(ROOT, "harness", "node_modules"));
  if (!env) return step(1, name, TODO, "no .env yet", "cp .env.example .env, then add your ANTHROPIC_API_KEY");
  const key = env.ANTHROPIC_API_KEY ?? "";
  const missing = [];
  if (!key || PLACEHOLDER_KEY.test(key)) missing.push("ANTHROPIC_API_KEY in .env");
  if (!installed) missing.push("harness dependencies");
  if (missing.length) {
    const next = installed ? "add your ANTHROPIC_API_KEY to .env" : "cd harness && npm install";
    return step(1, name, PARTIAL, `missing: ${missing.join(", ")}`, next);
  }
  return step(1, name, DONE, "API key set in .env, harness installed");
}

function defineDone(ids, latest) {
  const name = "Define done";
  if (!ids.length) return step(2, name, TODO, "no tasks in tasks/", "add a task folder (RUNBOOK.md, step 2)");
  let detail = `${ids.length} tasks with hidden suites`;
  const s = latest?.run.summary;
  if (s && s.totalTasks > 0 && s.passedAt1 === s.totalTasks) {
    // A suite the agent clears completely can no longer tell two agents apart.
    detail += `; saturated, your last run passed all ${s.totalTasks}: add harder tasks or capture a real session`;
  }
  return step(2, name, DONE, detail);
}

function run(runs) {
  const name = "Run";
  if (!runs.length) {
    return step(3, name, TODO, "no real runs yet (demo runs do not count)",
      "cd harness && npm run eval -- --model claude-sonnet-5 --label first-run");
  }
  const { run: r } = runs.at(-1);
  return step(3, name, DONE, `${runs.length} real run(s); latest ${r.config.label}, ${String(r.finishedAt).slice(0, 10)}`);
}

function verdict(latest) {
  const name = "Read the verdict";
  if (!latest) return step(4, name, TODO, "nothing to read until a real run exists");
  const s = latest.run.summary;
  const price = s.costPerSolve == null ? "" : ` at $${s.costPerSolve.toFixed(3)} per solve`;
  const result = `${s.passedAt1}/${s.totalTasks} passed${price}`;
  if (!existsSync(join(ROOT, "dashboard", "public", "results", latest.file))) {
    return step(4, name, PARTIAL, `${result}; not in the dashboard yet`,
      "cd dashboard && npm install && npm run sync && npm run dev");
  }
  return step(4, name, DONE, `${result} (${latest.file})`);
}

function explain(latest) {
  const name = "Explain the failures";
  if (!latest) return step(5, name, TODO, "nothing to explain until a real run exists");
  const failed = latest.run.tasks.filter((t) => !t.passed);
  if (!failed.length) return step(5, name, DONE, "no failures in the latest run");
  const untagged = failed.filter((t) => !(t.failureTags ?? []).length);
  if (untagged.length) return step(5, name, PARTIAL, `${untagged.length} failure(s) without a reason`);
  const counts = Object.entries(latest.run.summary.failureDistribution ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `${tag} ${n}`)
    .join(", ");
  return step(5, name, DONE, `every failure has a reason: ${counts}`);
}

function human(latest) {
  const name = "Record the human verdict";
  if (!latest) return step(6, name, TODO, "nothing to accept or reject until a real run exists");
  const outcomes = readJson(join(ROOT, "outcomes.json"), {});
  const ids = latest.run.tasks.map((t) => t.id);
  const pending = ids.filter((id) => !(id in outcomes));
  const recorded = ids.filter((id) => id in outcomes);
  const record = `node scripts/outcome.mjs --task ${pending[0]} --accepted   (or --rejected --note "why")`;

  if (!recorded.length) return step(6, name, TODO, `0 of ${ids.length} tasks have a verdict`, record);
  if (pending.length) return step(6, name, PARTIAL, `${recorded.length} of ${ids.length} tasks have a verdict`, record);
  // The harness merges outcomes.json at eval time, so a verdict recorded after
  // the latest run is not in the dashboard's matrix until the next run.
  const inRun = new Set(latest.run.tasks.filter((t) => t.outcome).map((t) => t.id));
  const unmerged = recorded.filter((id) => !inRun.has(id));
  if (unmerged.length) {
    return step(6, name, PARTIAL, `${unmerged.length} verdict(s) recorded since the latest run; they reach the dashboard with the next one`,
      "cd harness && npm run eval -- --model <the same model> --label <a new label>");
  }
  const o = latest.run.summary.metricLayers?.outcome;
  return step(6, name, DONE, `all ${ids.length} tasks have a verdict; passed but rejected ${o?.passedButRejected ?? 0}`);
}

function compare(runs) {
  const name = "Compare before you ship";
  if (runs.length < 2) {
    return step(7, name, TODO, "needs a second real run with one change (the model or the prompt)",
      "cd harness && npm run eval -- --model <another model> --label b");
  }
  const [a, b] = runs.slice(-2).map((x) => x.run);
  const ids = new Set(a.tasks.map((t) => t.id));
  const sameTasks = b.tasks.length === ids.size && b.tasks.every((t) => ids.has(t.id));
  if (!sameTasks) {
    return step(7, name, PARTIAL, "the last two real runs cover different tasks, so their flip list is not like for like",
      "rerun both on the same tasks (drop --only, or pass the same --only list)");
  }
  return step(7, name, DONE, `${a.config.label} vs ${b.config.label}: open Compare in the dashboard for the flip list`);
}

function routine(runs, now) {
  const name = "Make it routine";
  if (!runs.length) return step(8, name, TODO, "no real runs yet");
  const age = Math.floor((now - Date.parse(runs.at(-1).run.finishedAt)) / DAY_MS);
  if (age <= ROUTINE_DAYS) return step(8, name, DONE, `last real run ${age} day(s) ago`);
  return step(8, name, TODO, `last real run ${age} days ago; rerun after every agent, prompt, or model change`);
}

// ---- report ----------------------------------------------------------------

const now = Date.now();
const runs = realRuns();
const latest = runs.at(-1) ?? null;
const steps = [
  connect(),
  defineDone(taskIds(), latest),
  run(runs),
  verdict(latest),
  explain(latest),
  human(latest),
  compare(runs),
  routine(runs, now),
];

const today = new Date(now).toISOString().slice(0, 10);
console.log(`ForwardEval runbook, ${today}  (RUNBOOK.md explains each step)\n`);
for (const s of steps) console.log(`  ${s.number}  ${s.name.padEnd(25)} ${s.state.padEnd(12)} ${s.detail}`);

const first = steps.find((s) => s.state !== DONE);
if (!first) {
  console.log("\nEvery step has its evidence. Rerun after the next agent, prompt, or model change.");
} else {
  console.log(`\nNext, step ${first.number}, ${first.name.toLowerCase()}:\n  ${first.next ?? first.detail}`);
}
