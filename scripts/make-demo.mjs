#!/usr/bin/env node
/**
 * Demo-run generator (no API key required).
 *
 * Produces two committed result files so the dashboard renders immediately and
 * the Run Comparison view has something to compare.
 *
 * HONESTY NOTE: the pass/fail verdicts and the test output in these files are
 * REAL - each candidate file is actually run against the hidden test suite in
 * the sandbox, exactly as a live run would. Only the transcripts and token
 * counts are *simulated* (a real run records the actual agent transcript and
 * real API token usage). These files are seed/demo data; regenerate with a real
 * run via `npm run eval` once ANTHROPIC_API_KEY is set.
 */
import {
  readdirSync,
  readFileSync,
  mkdtempSync,
  cpSync,
  writeFileSync,
  rmSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TASKS_DIR = join(ROOT, "tasks");
const REF_DIR = join(__dirname, "references");
const RESULTS_DIR = join(ROOT, "results");

const PRICING = { inputPerMTok: 3.0, outputPerMTok: 15.0 }; // sonnet-class

// ---- helpers ---------------------------------------------------------------

function parseCounts(stdout, stderr, exitCode) {
  const text = `${stdout}\n${stderr}`;
  const ran = /Ran (\d+) tests?/.exec(text);
  if (ran) {
    const total = Number(ran[1]);
    const fm = /FAILED \(([^)]*)\)/.exec(text);
    let failed = 0;
    if (fm) {
      const f = /failures=(\d+)/.exec(fm[1]);
      const e = /errors=(\d+)/.exec(fm[1]);
      failed = (f ? Number(f[1]) : 0) + (e ? Number(e[1]) : 0);
    }
    return { passed: total - failed, failed, total };
  }
  return exitCode === 0 ? { passed: 1, failed: 0, total: 1 } : { passed: 0, failed: 1, total: 1 };
}

function runCandidate(taskDir, spec, entryContents) {
  const work = mkdtempSync(join(tmpdir(), "fe-demo-"));
  try {
    cpSync(taskDir, work, { recursive: true });
    writeFileSync(join(work, spec.entry_file), entryContents);
    const parts = spec.test_command.split(" ");
    const t0 = Date.now();
    const res = spawnSync(parts[0], parts.slice(1), {
      cwd: work,
      encoding: "utf8",
      timeout: 30_000,
    });
    const durationMs = Date.now() - t0;
    const counts = parseCounts(res.stdout || "", res.stderr || "", res.status ?? 1);
    return {
      stdout: res.stdout || "",
      stderr: res.stderr || "",
      exitCode: res.status ?? 1,
      ...counts,
      timedOut: false,
      durationMs,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const round4 = (n) => Math.round(n * 10000) / 10000;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const costFor = (tok) =>
  round6((tok.input / 1e6) * PRICING.inputPerMTok + (tok.output / 1e6) * PRICING.outputPerMTok);

function tokensFor(difficulty, passed) {
  const base = { easy: 5000, medium: 11000, hard: 22000 }[difficulty];
  const jitter = Math.round(base * (passed ? 0.85 : 1.25)); // failures burn more
  const input = Math.round(jitter * 0.7);
  const output = jitter - input;
  return { input, output, total: input + output };
}

function turnsFor(difficulty, passed) {
  const t = { easy: 2, medium: 3, hard: 5 }[difficulty];
  return passed ? t : Math.min(t + 1, 6);
}

function buildTranscript(spec, stub, finalCode, testOutput, passed, note) {
  const t = [];
  t.push({ type: "system", text: "[coding-agent system prompt]" });
  t.push({ type: "assistant_text", text: `I'll start by reading ${spec.entry_file} to understand the current behavior.` });
  t.push({ type: "tool_use", tool: "read_file", input: { path: spec.entry_file }, toolUseId: "tu_read" });
  t.push({ type: "tool_result", toolUseId: "tu_read", tool: "read_file", content: stub, isError: false });
  t.push({ type: "assistant_text", text: note.reasoning });
  t.push({ type: "tool_use", tool: "write_file", input: { path: spec.entry_file, contents: finalCode }, toolUseId: "tu_write" });
  t.push({ type: "tool_result", toolUseId: "tu_write", tool: "write_file", content: `Wrote ${spec.entry_file}.`, isError: false });
  t.push({ type: "tool_use", tool: "run_tests", input: {}, toolUseId: "tu_test" });
  t.push({
    type: "tool_result",
    toolUseId: "tu_test",
    tool: "run_tests",
    content: `exit_code: ${testOutput.exitCode}\n--- stdout ---\n${testOutput.stdout}\n--- stderr ---\n${testOutput.stderr}`.slice(0, 4000),
    isError: false,
  });
  t.push({
    type: "assistant_text",
    text: passed ? "All tests pass. The fix is complete." : note.giveUp,
  });
  t.push({ type: "final_verification", testOutput });
  return t;
}

function buildTaskResult(taskDir, spec, scenario) {
  const stub = readFileSync(join(taskDir, spec.entry_file), "utf8");
  const ref = readFileSync(join(REF_DIR, `${spec.id}.py`), "utf8");
  const finalCode = scenario.pass ? ref : (scenario.candidate ?? stub);
  const testOutput = runCandidate(taskDir, spec, finalCode);
  const passed = testOutput.exitCode === 0;
  const tokens = tokensFor(spec.difficulty, passed);
  const turnsUsed = turnsFor(spec.difficulty, passed);
  const cost = costFor(tokens);
  const wallClockMs = 4000 + turnsUsed * 1500 + testOutput.durationMs;
  const failureTags = passed ? [] : scenario.tags ?? [{ tag: "wrong_approach", justification: "Did not satisfy the hidden tests." }];
  const transcript = buildTranscript(spec, stub, finalCode, testOutput, passed, scenario.note ?? { reasoning: "Applying a fix.", giveUp: "The tests still fail; I was unable to resolve all cases." });

  const attempt = {
    attempt: 0,
    passed,
    turnsUsed,
    stopReason: passed ? "tests_passed" : "turn_cap",
    tokens,
    cost,
    wallClockMs,
    finalTestOutput: testOutput,
    failureTags,
    transcript,
    finalCode,
  };

  return {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    difficulty: spec.difficulty,
    prompt: spec.prompt,
    entryFile: spec.entry_file,
    testCommand: spec.test_command,
    stubCode: stub,
    passAt1: passed,
    passAtK: passed,
    representativeAttempt: 0,
    passed,
    turnsUsed,
    tokens,
    cost,
    wallClockMs,
    failureTags,
    finalTestOutput: testOutput,
    finalCode,
    attempts: [attempt],
  };
}

function summarize(tasks, pricing) {
  const total = tasks.length;
  const passedAt1 = tasks.filter((t) => t.passAt1).length;
  const byCategory = {}, byDifficulty = {}, failureDistribution = {};
  let tokens = { input: 0, output: 0, total: 0 };
  let wastedTokens = 0, turnsSum = 0, solved = 0, wall = 0;
  for (const t of tasks) {
    for (const [map, key] of [[byCategory, t.category], [byDifficulty, t.difficulty]]) {
      const r = (map[key] ??= { total: 0, passed: 0, rate: 0 });
      r.total++; if (t.passed) r.passed++;
    }
    tokens.input += t.tokens.input; tokens.output += t.tokens.output; tokens.total += t.tokens.total;
    wall += t.wallClockMs;
    if (t.passed) { turnsSum += t.turnsUsed; solved++; }
    else { wastedTokens += t.tokens.total; for (const ft of t.failureTags) failureDistribution[ft.tag] = (failureDistribution[ft.tag] ?? 0) + 1; }
  }
  for (const map of [byCategory, byDifficulty]) for (const k of Object.keys(map)) map[k].rate = round4(map[k].passed / map[k].total);
  const cost = costFor(tokens);
  return {
    totalTasks: total, passedAt1, passAt1Rate: round4(passedAt1 / total),
    passedAtK: passedAt1, passAtKRate: round4(passedAt1 / total),
    byCategory, byDifficulty, failureDistribution,
    tokens, cost,
    avgTurnsToSolve: solved ? Math.round((turnsSum / solved) * 100) / 100 : 0,
    tokensPerSolve: passedAt1 ? Math.round(tokens.total / passedAt1) : 0,
    costPerSolve: passedAt1 ? round6(cost / passedAt1) : null,
    wastedTokens,
    wastedCost: costFor({ input: 0, output: wastedTokens, total: wastedTokens }),
    totalWallClockMs: wall,
  };
}

function makeRun(label, model, scenarios) {
  const names = readdirSync(TASKS_DIR).filter((n) => statSync(join(TASKS_DIR, n)).isDirectory()).sort();
  const tasks = names.map((name) => {
    const taskDir = join(TASKS_DIR, name);
    const spec = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf8"));
    return buildTaskResult(taskDir, spec, scenarios[spec.id] ?? { pass: true });
  });
  const config = {
    model, temperature: 0, maxTurns: 6, attempts: 1,
    pricing: PRICING, label, harnessVersion: "0.1.0",
    verification: "confirmed", sandboxTimeoutMs: 30000,
  };
  const summary = summarize(tasks, PRICING);
  const runId = `2026-06-20-${label}`;
  return {
    schemaVersion: 1, runId,
    startedAt: "2026-06-20T17:00:00.000Z", finishedAt: "2026-06-20T17:18:00.000Z",
    config, summary, tasks,
    _demo: true,
  };
}

// ---- scenarios -------------------------------------------------------------

// Baseline run: 12/15 pass. Three realistic failures.
const baseline = {
  "word-count-edgecases": {
    pass: false,
    tags: [{ tag: "missed_edge_case", justification: "Lowercased and split on whitespace but never stripped trailing punctuation, so 'cat,' and 'cat' counted separately." }],
    note: { reasoning: "I'll lowercase each token and count it. That should handle the casing requirement.", giveUp: "Casing tests pass but the punctuation-stripping tests still fail. I lowercased but did not strip surrounding punctuation." },
    candidate: "def word_count(text):\n    counts = {}\n    for w in text.split():\n        w = w.lower()\n        counts[w] = counts.get(w, 0) + 1\n    return counts\n",
  },
  "token-bucket-rate-limiter": {
    pass: false,
    tags: [{ tag: "wrong_approach", justification: "Tracked elapsed time but reset the bucket to full on every call instead of accruing fractional tokens, so the refill cap and partial-refill cases fail." }],
    note: { reasoning: "I'll record the last timestamp and refill by setting tokens back to capacity whenever time has passed.", giveUp: "The 'starts full then empties' case passes, but refill-cap and sequence tests fail because my refill logic overfills." },
    candidate: "class RateLimiter:\n    def __init__(self, capacity, refill_rate):\n        self.capacity = capacity\n        self.refill_rate = refill_rate\n        self.tokens = capacity\n        self.last = None\n    def allow(self, timestamp):\n        if self.last is not None and timestamp > self.last:\n            self.tokens = self.capacity  # BUG: overfills\n        self.last = timestamp\n        if self.tokens >= 1:\n            self.tokens -= 1\n            return True\n        return False\n",
  },
  "lru-cache": {
    pass: false,
    tags: [{ tag: "regression", justification: "Added recency refresh on get but broke update-existing: re-inserting an existing key no longer moves it, so the wrong entry is evicted." }],
    note: { reasoning: "I'll use an OrderedDict and move keys to the end on get. For put I'll just set the value.", giveUp: "get-refreshes-recency now passes, but update-refreshes-recency regressed because I didn't move the key on update." },
    candidate: "from collections import OrderedDict\n\n\nclass LRUCache:\n    def __init__(self, capacity):\n        self.capacity = capacity\n        self.store = OrderedDict()\n    def get(self, key):\n        if key not in self.store:\n            return -1\n        self.store.move_to_end(key)\n        return self.store[key]\n    def put(self, key, value):\n        self.store[key] = value  # BUG: no move_to_end on update\n        if len(self.store) > self.capacity:\n            self.store.popitem(last=False)\n",
  },
};

// v2 run (improved prompt): fixes word-count + token-bucket, but regresses
// roman-numerals (a believable prompt-tuning side effect). Net 12 -> 13.
const v2 = {
  "roman-numerals": {
    pass: false,
    tags: [{ tag: "missed_edge_case", justification: "Handled single subtractive pairs but emitted 'IM' for 999 instead of 'CMXCIX' - greedy table missing the 900/90/9 rows." }],
    note: { reasoning: "I'll add IV and IX special cases on top of the additive table.", giveUp: "Small numbers pass but 900/3999 fail; my subtractive handling is incomplete." },
    candidate: "def int_to_roman(n):\n    vals = [(1000, 'M'), (500, 'D'), (100, 'C'), (50, 'L'), (10, 'X'), (5, 'V'), (1, 'I')]\n    res = []\n    for v, sym in vals:\n        while n >= v:\n            res.append(sym)\n            n -= v\n    s = ''.join(res)\n    return s.replace('IIII', 'IV').replace('VIV', 'IX')\n",
  },
};

// ---- write -----------------------------------------------------------------

mkdirSync(RESULTS_DIR, { recursive: true });
for (const [label, scen] of [["sonnet-baseline", baseline], ["sonnet-v2-prompt", v2]]) {
  const run = makeRun(label, "claude-sonnet-4-6", scen);
  const path = join(RESULTS_DIR, `${run.runId}.json`);
  writeFileSync(path, JSON.stringify(run, null, 2));
  console.log(`wrote ${path}  pass@1 ${run.summary.passedAt1}/${run.summary.totalTasks}`);
}
console.log("\nDemo data generated. Run `node scripts/sync-results.mjs` to publish to the dashboard.");
