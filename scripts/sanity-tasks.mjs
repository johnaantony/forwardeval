#!/usr/bin/env node
/**
 * Task sanity checker (no API key, no build required).
 *
 * For every task it asserts the two invariants that make the task well-formed:
 *   1. The stub FAILS its hidden test suite (exit code != 0).
 *   2. The reference solution PASSES the same suite (exit code == 0).
 *
 * If a stub accidentally passes, the task is too easy / the bug isn't real.
 * If a reference fails, the test suite is wrong. Either way, fix before trusting
 * any agent run on that task.
 */
import {
  readdirSync,
  readFileSync,
  mkdtempSync,
  cpSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TASKS_DIR = join(ROOT, "tasks");
const REF_DIR = join(__dirname, "references");

function runWithEntry(taskDir, spec, entryContents) {
  const work = mkdtempSync(join(tmpdir(), "fe-sanity-"));
  try {
    cpSync(taskDir, work, { recursive: true });
    writeFileSync(join(work, spec.entry_file), entryContents);
    const parts = spec.test_command.split(" ");
    const res = spawnSync(parts[0], parts.slice(1), {
      cwd: work,
      encoding: "utf8",
      timeout: 30_000,
    });
    return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const taskNames = readdirSync(TASKS_DIR).filter((n) =>
  statSync(join(TASKS_DIR, n)).isDirectory(),
);

let ok = 0;
let bad = 0;
const failures = [];

for (const name of taskNames.sort()) {
  const taskDir = join(TASKS_DIR, name);
  const spec = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf8"));
  const stub = readFileSync(join(taskDir, spec.entry_file), "utf8");

  const refPath = join(REF_DIR, `${spec.id}.py`);
  if (!existsSync(refPath)) {
    failures.push(`${spec.id}: missing reference at scripts/references/${spec.id}.py`);
    bad++;
    continue;
  }
  const ref = readFileSync(refPath, "utf8");

  const stubRun = runWithEntry(taskDir, spec, stub);
  const refRun = runWithEntry(taskDir, spec, ref);

  const stubFails = stubRun.status !== 0; // expected
  const refPasses = refRun.status === 0; // expected

  if (stubFails && refPasses) {
    console.log(`  ok    ${spec.id.padEnd(28)} [${spec.category}/${spec.difficulty}]`);
    ok++;
  } else {
    bad++;
    console.log(`  FAIL  ${spec.id.padEnd(28)} stubFails=${stubFails} refPasses=${refPasses}`);
    if (!stubFails) failures.push(`${spec.id}: stub unexpectedly PASSED (bug not real)`);
    if (!refPasses)
      failures.push(
        `${spec.id}: reference FAILED:\n${refRun.stdout}\n${refRun.stderr}`.slice(0, 1200),
      );
  }
}

console.log(`\n${ok}/${taskNames.length} tasks well-formed.`);
if (bad > 0) {
  console.log(`\n${bad} problem(s):`);
  for (const f of failures) console.log(`- ${f}`);
  process.exit(1);
}
