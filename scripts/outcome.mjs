#!/usr/bin/env node
/**
 * Layer-3 outcome recorder (v0.4).
 *
 * Tests can say a solution is CORRECT; only a human can say it was ACCEPTED.
 * This records that judgment in outcomes.json, which the harness merges into
 * the next run so the dashboard can show the cross-layer matrix, including the
 * cell that matters most: passed-but-rejected (tests green, human said no).
 *
 * Usage:
 *   node scripts/outcome.mjs --task <id> --accepted [--note "..."]
 *   node scripts/outcome.mjs --task <id> --rejected [--rework] [--note "..."]
 *   node scripts/outcome.mjs --list
 *
 * The file is plain JSON next to the repo root - edit it by hand if you like:
 *   { "<taskId>": { "accepted": false, "reworkRequired": true, "note": "..." } }
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTCOMES_PATH = join(ROOT, "outcomes.json");
const TASKS_DIR = join(ROOT, "tasks");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function load() {
  if (!existsSync(OUTCOMES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(OUTCOMES_PATH, "utf8"));
  } catch {
    console.error(`WARNING: ${OUTCOMES_PATH} is not valid JSON; starting fresh.`);
    return {};
  }
}

const args = parseArgs(process.argv.slice(2));
const outcomes = load();

if (args.list) {
  const ids = Object.keys(outcomes);
  if (ids.length === 0) {
    console.log("No outcomes recorded yet.");
  } else {
    for (const id of ids.sort()) {
      const o = outcomes[id];
      console.log(
        `${id.padEnd(30)} ${o.accepted ? "ACCEPTED" : "REJECTED"}${o.reworkRequired ? " (rework)" : ""}${o.note ? `  - ${o.note}` : ""}`,
      );
    }
  }
  process.exit(0);
}

const taskId = args.task;
if (typeof taskId !== "string") {
  console.error("Usage: node scripts/outcome.mjs --task <id> --accepted|--rejected [--rework] [--note \"...\"]");
  process.exit(1);
}

// Guard against typos: warn (but do not block) when the task id is unknown.
const known = readdirSync(TASKS_DIR).filter((n) => statSync(join(TASKS_DIR, n)).isDirectory());
if (!known.includes(taskId)) {
  console.error(`WARNING: no task directory named "${taskId}" (recording anyway).`);
}

if (!args.accepted && !args.rejected) {
  console.error("Specify --accepted or --rejected.");
  process.exit(1);
}

outcomes[taskId] = {
  accepted: !!args.accepted && !args.rejected,
  ...(args.rework ? { reworkRequired: true } : {}),
  ...(typeof args.note === "string" ? { note: args.note } : {}),
  recordedAt: new Date().toISOString(),
};

writeFileSync(OUTCOMES_PATH, JSON.stringify(outcomes, null, 2) + "\n");
console.log(
  `Recorded: ${taskId} -> ${outcomes[taskId].accepted ? "ACCEPTED" : "REJECTED"}. It will appear in the next run's outcome layer.`,
);
