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

const LLM_TEST_FILE = "test_suite_llm.py";

/**
 * Demo LLM-authored test suites (for the --tests both comparison view).
 *
 * HONESTY NOTE: as with the rest of the demo, these suites are ACTUALLY RUN
 * against the candidate code in the sandbox, so the pass/fail and the agreement
 * are real. What is simulated is only the PROVENANCE label ("an LLM wrote this"):
 * here a human hand-wrote plausible LLM-style suites that cover the obvious cases
 * and, on two tasks, miss an edge case the expert suite caught. A live
 * `npm run eval -- --tests both` replaces these with suites a model actually
 * authored and records the real test-gen token cost.
 */
const DEMO_LLM_SUITES = {
  fizzbuzz: `import unittest
from solution_stub import fizzbuzz


class TestFizzBuzz(unittest.TestCase):
    def test_small(self):
        self.assertEqual(fizzbuzz(5), ["1", "2", "Fizz", "4", "Buzz"])

    def test_fizzbuzz_at_15(self):
        self.assertEqual(fizzbuzz(15)[14], "FizzBuzz")

    def test_all_strings(self):
        self.assertTrue(all(isinstance(x, str) for x in fizzbuzz(20)))


if __name__ == "__main__":
    unittest.main()
`,
  "balanced-parens": `import unittest
from solution_stub import is_balanced


class TestBalanced(unittest.TestCase):
    def test_simple(self):
        self.assertTrue(is_balanced("()"))
        self.assertTrue(is_balanced("([]{})"))

    def test_mismatched_order(self):
        self.assertFalse(is_balanced("([)]"))

    def test_unclosed(self):
        self.assertFalse(is_balanced("((("))

    def test_ignores_non_brackets(self):
        self.assertTrue(is_balanced("a(b)c"))


if __name__ == "__main__":
    unittest.main()
`,
  "roman-numerals": `import unittest
from solution_stub import int_to_roman


class TestRoman(unittest.TestCase):
    def test_basic_subtractive(self):
        self.assertEqual(int_to_roman(1), "I")
        self.assertEqual(int_to_roman(4), "IV")
        self.assertEqual(int_to_roman(9), "IX")

    def test_tens(self):
        self.assertEqual(int_to_roman(40), "XL")
        self.assertEqual(int_to_roman(90), "XC")

    def test_compound(self):
        self.assertEqual(int_to_roman(1994), "MCMXCIV")


if __name__ == "__main__":
    unittest.main()
`,
  // MISSES the punctuation/apostrophe edge cases the expert suite catches.
  "word-count-edgecases": `import unittest
from solution_stub import word_count


class TestWordCount(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(word_count("the cat sat"), {"the": 1, "cat": 1, "sat": 1})

    def test_case_insensitive(self):
        self.assertEqual(word_count("The the THE"), {"the": 3})

    def test_repeats(self):
        self.assertEqual(word_count("a a b"), {"a": 2, "b": 1})


if __name__ == "__main__":
    unittest.main()
`,
  // MISSES time-based refill: only checks same-timestamp exhaustion.
  "token-bucket-rate-limiter": `import unittest
from solution_stub import RateLimiter


class TestRateLimiter(unittest.TestCase):
    def test_starts_full(self):
        rl = RateLimiter(2, 1)
        self.assertTrue(rl.allow(0))
        self.assertTrue(rl.allow(0))

    def test_blocks_when_empty(self):
        rl = RateLimiter(2, 1)
        rl.allow(0)
        rl.allow(0)
        self.assertFalse(rl.allow(0))

    def test_single_capacity(self):
        rl = RateLimiter(1, 1)
        self.assertTrue(rl.allow(0))
        self.assertFalse(rl.allow(0))


if __name__ == "__main__":
    unittest.main()
`,
  // This one DOES catch the update-recency bug, so it agrees with the expert.
  "lru-cache": `import unittest
from solution_stub import LRUCache


class TestLRU(unittest.TestCase):
    def test_basic_eviction(self):
        c = LRUCache(2)
        c.put(1, 1)
        c.put(2, 2)
        self.assertEqual(c.get(1), 1)
        c.put(3, 3)
        self.assertEqual(c.get(2), -1)
        self.assertEqual(c.get(3), 3)

    def test_update_refreshes_recency(self):
        c = LRUCache(2)
        c.put(1, 1)
        c.put(2, 2)
        c.put(1, 10)
        c.put(3, 3)
        self.assertEqual(c.get(1), 10)
        self.assertEqual(c.get(2), -1)


if __name__ == "__main__":
    unittest.main()
`,
  "binary-search-offbyone": `import unittest
from solution_stub import search


class TestSearch(unittest.TestCase):
    def test_found(self):
        self.assertEqual(search([1, 3, 5, 7], 5), 2)

    def test_not_found(self):
        self.assertEqual(search([1, 3, 5, 7], 4), -1)

    def test_empty(self):
        self.assertEqual(search([], 1), -1)

    def test_single(self):
        self.assertEqual(search([9], 9), 0)


if __name__ == "__main__":
    unittest.main()
`,
  "csv-parser-quoted-commas": `import unittest
from solution_stub import parse_csv


class TestParseCsv(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(parse_csv("a,b,c"), ["a", "b", "c"])

    def test_quoted_comma(self):
        self.assertEqual(parse_csv('"a,b",c'), ["a,b", "c"])

    def test_empty_line(self):
        self.assertEqual(parse_csv(""), [""])


if __name__ == "__main__":
    unittest.main()
`,
  "dedupe-preserve-order": `import unittest
from solution_stub import dedupe


class TestDedupe(unittest.TestCase):
    def test_order_preserved(self):
        self.assertEqual(dedupe([3, 1, 3, 2, 1]), [3, 1, 2])

    def test_empty(self):
        self.assertEqual(dedupe([]), [])

    def test_no_dupes(self):
        self.assertEqual(dedupe([1, 2, 3]), [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
`,
  "flatten-nested-list": `import unittest
from solution_stub import flatten


class TestFlatten(unittest.TestCase):
    def test_nested(self):
        self.assertEqual(flatten([1, [2, [3]], 4]), [1, 2, 3, 4])

    def test_empty(self):
        self.assertEqual(flatten([]), [])

    def test_flat(self):
        self.assertEqual(flatten([1, 2]), [1, 2])


if __name__ == "__main__":
    unittest.main()
`,
  "merge-intervals": `import unittest
from solution_stub import merge


class TestMerge(unittest.TestCase):
    def test_overlap(self):
        self.assertEqual(merge([[1, 3], [2, 6], [8, 10]]), [[1, 6], [8, 10]])

    def test_touching(self):
        self.assertEqual(merge([[1, 2], [2, 3]]), [[1, 3]])

    def test_empty(self):
        self.assertEqual(merge([]), [])


if __name__ == "__main__":
    unittest.main()
`,
  "run-length-encoding": `import unittest
from solution_stub import encode


class TestEncode(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(encode("aaabb"), "a3b2")

    def test_single(self):
        self.assertEqual(encode("a"), "a1")

    def test_empty(self):
        self.assertEqual(encode(""), "")


if __name__ == "__main__":
    unittest.main()
`,
  "snake-to-camel": `import unittest
from solution_stub import to_camel


class TestToCamel(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(to_camel("hello_world"), "helloWorld")

    def test_many_parts(self):
        self.assertEqual(to_camel("a_b_c"), "aBC")

    def test_single_word(self):
        self.assertEqual(to_camel("word"), "word")

    def test_empty(self):
        self.assertEqual(to_camel(""), "")


if __name__ == "__main__":
    unittest.main()
`,
  "temperature-convert": `import unittest
from solution_stub import convert


class TestConvert(unittest.TestCase):
    def test_c_to_f(self):
        self.assertEqual(convert(0, "C", "F"), 32.0)

    def test_f_to_c(self):
        self.assertEqual(convert(212, "F", "C"), 100.0)

    def test_c_to_k(self):
        self.assertEqual(convert(0, "C", "K"), 273.15)


if __name__ == "__main__":
    unittest.main()
`,
  // MISSES the leading-zero rule ("01.2.3.4" must be invalid) the expert asserts.
  "validate-ipv4": `import unittest
from solution_stub import is_valid_ipv4


class TestIpv4(unittest.TestCase):
    def test_valid(self):
        self.assertTrue(is_valid_ipv4("192.168.0.1"))
        self.assertTrue(is_valid_ipv4("255.255.255.255"))

    def test_out_of_range(self):
        self.assertFalse(is_valid_ipv4("256.1.1.1"))

    def test_wrong_octet_count(self):
        self.assertFalse(is_valid_ipv4("1.2.3"))

    def test_non_numeric(self):
        self.assertFalse(is_valid_ipv4("a.b.c.d"))


if __name__ == "__main__":
    unittest.main()
`,
  // MISSES separator collapsing and the empty->"untitled" fallback.
  "slugify-url-handles": `import unittest
from solution_stub import slugify


class TestSlugify(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_punctuation(self):
        self.assertEqual(slugify("Hello, World!"), "hello-world")

    def test_lowercase(self):
        self.assertEqual(slugify("MiXeD"), "mixed")


if __name__ == "__main__":
    unittest.main()
`,
  // MISSES the backoff schedule (only counts calls and the re-raise).
  "retry-with-backoff": `import unittest
from solution_stub import retry


class TestRetry(unittest.TestCase):
    def test_success(self):
        self.assertEqual(retry(lambda: 7, sleep=lambda d: None), 7)

    def test_retries_then_succeeds(self):
        calls = []
        def flaky():
            calls.append(1)
            if len(calls) < 3:
                raise ValueError("boom")
            return "ok"
        self.assertEqual(retry(flaky, attempts=3, sleep=lambda d: None), "ok")
        self.assertEqual(len(calls), 3)

    def test_reraises(self):
        def always():
            raise ValueError("nope")
        with self.assertRaises(ValueError):
            retry(always, attempts=2, sleep=lambda d: None)


if __name__ == "__main__":
    unittest.main()
`,
};

/**
 * Layer-3 demo outcomes (the human-acceptance sidecar). The interesting cell:
 * retry-with-backoff PASSES its ratified suite but the human REJECTED it -
 * the helper retries every exception type and the caller needed ValueError to
 * fail fast. Tests said green; the person said no. That is passedButRejected.
 */
const DEMO_OUTCOMES = {
  "retry-with-backoff": {
    accepted: false,
    reworkRequired: true,
    note: "Backoff is correct, but it retries EVERY exception; callers need ValueError to fail fast. The suite never encoded that intent.",
    recordedAt: "2026-07-16T18:30:00.000Z",
  },
  "slugify-url-handles": {
    accepted: true,
    note: "Shipped in the page editor.",
    recordedAt: "2026-07-15T22:10:00.000Z",
  },
  fizzbuzz: { accepted: true, recordedAt: "2026-07-15T22:11:00.000Z" },
  "snake-to-camel": { accepted: true, recordedAt: "2026-07-15T22:12:00.000Z" },
  "lru-cache": {
    accepted: false,
    note: "Failed the suite and the review: eviction order bug plus an API rename.",
    recordedAt: "2026-07-15T22:13:00.000Z",
  },
};

function agreementOf(humanPass, llmPass) {
  if (humanPass && llmPass) return "agree_pass";
  if (!humanPass && !llmPass) return "agree_fail";
  if (llmPass && !humanPass) return "llm_missed";
  return "llm_stricter";
}

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

/** Run an LLM-authored suite (real execution) against the candidate code. */
function runLlmSuite(taskDir, spec, entryContents, llmTestCode) {
  const work = mkdtempSync(join(tmpdir(), "fe-demo-llm-"));
  try {
    cpSync(taskDir, work, { recursive: true });
    writeFileSync(join(work, spec.entry_file), entryContents);
    writeFileSync(join(work, LLM_TEST_FILE), llmTestCode);
    const t0 = Date.now();
    const res = spawnSync("python3", [LLM_TEST_FILE], {
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

const addTok = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, total: a.total + b.total });

/** Roll up the human-vs-LLM comparison across demo tasks (mirrors report.ts). */
function summarizeAuthorship(tasks, testGenTokens) {
  let comparedTasks = 0, agree = 0, llmMissed = 0, llmStricter = 0;
  let humanTestCount = 0, llmTestCount = 0, humanPassAt1 = 0, llmPassAt1 = 0;
  for (const t of tasks) {
    const ta = t.attempts[0]?.testAuthorship ?? t.testAuthorship;
    if (!ta || !ta.human || !ta.llm) continue;
    comparedTasks++;
    humanTestCount += ta.human.output.total;
    llmTestCount += ta.llm.output.total;
    if (ta.human.verdict) humanPassAt1++;
    if (ta.llm.verdict) llmPassAt1++;
    if (ta.agreement === "agree_pass" || ta.agreement === "agree_fail") agree++;
    else if (ta.agreement === "llm_missed") llmMissed++;
    else if (ta.agreement === "llm_stricter") llmStricter++;
  }
  return {
    mode: "both",
    verdictSource: "human",
    comparedTasks,
    agree,
    agreementRate: comparedTasks ? round4(agree / comparedTasks) : 0,
    llmMissed,
    llmStricter,
    humanTestCount,
    llmTestCount,
    humanPassAt1,
    llmPassAt1,
    testGenTokens,
    testGenCost: costFor(testGenTokens),
  };
}

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
  const testResult = (id) => ({
    type: "tool_result",
    toolUseId: id,
    tool: "run_tests",
    content: `exit_code: ${testOutput.exitCode}\n--- stdout ---\n${testOutput.stdout}\n--- stderr ---\n${testOutput.stderr}`.slice(0, 4000),
    isError: false,
  });
  t.push({ type: "system", text: "[coding-agent system prompt]" });
  t.push({ type: "assistant_text", text: `I'll start by reading ${spec.entry_file} to understand the current behavior.` });
  t.push({ type: "tool_use", tool: "read_file", input: { path: spec.entry_file }, toolUseId: "tu_read" });
  t.push({ type: "tool_result", toolUseId: "tu_read", tool: "read_file", content: stub, isError: false });
  t.push({ type: "assistant_text", text: note.reasoning });
  t.push({ type: "tool_use", tool: "write_file", input: { path: spec.entry_file, contents: finalCode }, toolUseId: "tu_write" });
  t.push({ type: "tool_result", toolUseId: "tu_write", tool: "write_file", content: `Wrote ${spec.entry_file}.`, isError: false });
  t.push({ type: "tool_use", tool: "run_tests", input: {}, toolUseId: "tu_test" });
  t.push(testResult("tu_test"));
  if (!passed) {
    // Failed tasks show a realistic rework loop: react to failures, rewrite,
    // re-run, still fail. This is what the behavior layer measures.
    t.push({ type: "assistant_text", text: "Some tests still fail. Let me adjust the approach and retry." });
    t.push({ type: "tool_use", tool: "write_file", input: { path: spec.entry_file, contents: finalCode }, toolUseId: "tu_write2" });
    t.push({ type: "tool_result", toolUseId: "tu_write2", tool: "write_file", content: `Wrote ${spec.entry_file}.`, isError: false });
    t.push({ type: "tool_use", tool: "run_tests", input: {}, toolUseId: "tu_test2" });
    t.push(testResult("tu_test2"));
  }
  t.push({
    type: "assistant_text",
    text: passed ? "All tests pass. The fix is complete." : note.giveUp,
  });
  t.push({ type: "final_verification", testOutput });
  return t;
}

/** Layer-2 behavior stats from a transcript (mirrors harness/src/behavior.ts). */
function deriveBehavior(transcript, turnsUsed, passedFallback) {
  let toolCalls = 0, testRuns = 0, writes = 0, reworkLoops = 0;
  let firstTestExitZero = null;
  let seenFirstTestRun = false;
  for (const item of transcript) {
    if (item.type === "tool_use") {
      toolCalls++;
      if (item.tool === "run_tests") { testRuns++; seenFirstTestRun = true; }
      else if (item.tool === "write_file") { writes++; if (seenFirstTestRun) reworkLoops++; }
    } else if (item.type === "tool_result" && item.tool === "run_tests" && firstTestExitZero === null) {
      firstTestExitZero = /exit_code:\s*0\b/.test(item.content);
    }
  }
  return { toolCalls, testRuns, writes, reworkLoops, firstTryPass: firstTestExitZero ?? passedFallback, turnsUsed };
}

function buildTaskResult(taskDir, spec, scenario, withAuthorship) {
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

  // Human-vs-LLM test authorship comparison (same solution, two suites).
  let testAuthorship;
  let testGenTokens = { input: 0, output: 0, total: 0 };
  const llmCode = withAuthorship ? DEMO_LLM_SUITES[spec.id] : undefined;
  if (llmCode) {
    const llmOutput = runLlmSuite(taskDir, spec, finalCode, llmCode);
    const llmPass = llmOutput.exitCode === 0;
    testAuthorship = {
      human: { author: "human", verdict: passed, output: testOutput, generated: false, testCode: null },
      llm: { author: "llm", verdict: llmPass, output: llmOutput, generated: true, testCode: llmCode },
      agreement: agreementOf(passed, llmPass),
    };
    const out = Math.round(llmCode.length / 4);
    const inp = 1200 + Math.round(stub.length / 4);
    testGenTokens = { input: inp, output: out, total: inp + out };
  }

  const behavior = deriveBehavior(transcript, turnsUsed, passed);

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
    ...(testAuthorship ? { testAuthorship } : {}),
    behavior,
  };

  const task = {
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
    ...(testAuthorship ? { testAuthorship } : {}),
    behavior,
    ...(spec.provenance ? { provenance: spec.provenance } : {}),
    attempts: [attempt],
  };

  return { task, testGenTokens };
}

// ---- v0.4 summary blocks (mirror harness/src/report.ts) --------------------

const CAL_THRESHOLDS = { autonomous: 0.9, supervised: 0.7, minN: 3, minNAutonomous: 10 };

function wilson(agree, n) {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.96, p = agree / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: round4(Math.max(0, center - half)), high: round4(Math.min(1, center + half)) };
}

function calCell(agree, n) {
  const rate = n ? round4(agree / n) : 0;
  const t = CAL_THRESHOLDS;
  let band;
  if (n < t.minN) band = "insufficient_data";
  else if (rate >= t.autonomous && n >= t.minNAutonomous) band = "autonomous";
  else if (rate >= t.supervised) band = "supervised";
  else band = "unsafe";
  return { n, agree, agreementRate: rate, ci: wilson(agree, n), band };
}

function summarizeCalibration(tasks) {
  let n = 0, agree = 0;
  const catN = {}, catAgree = {};
  for (const t of tasks) {
    const ta = t.attempts[0]?.testAuthorship ?? t.testAuthorship;
    if (!ta || !ta.human || !ta.llm) continue;
    n++;
    catN[t.category] = (catN[t.category] ?? 0) + 1;
    if (ta.agreement === "agree_pass" || ta.agreement === "agree_fail") {
      agree++;
      catAgree[t.category] = (catAgree[t.category] ?? 0) + 1;
    }
  }
  if (n === 0) return null;
  const byCategory = {};
  for (const c of Object.keys(catN)) byCategory[c] = calCell(catAgree[c] ?? 0, catN[c]);
  return { overall: calCell(agree, n), byCategory, thresholds: CAL_THRESHOLDS };
}

function summarizeLayers(tasks) {
  const withB = tasks.filter((t) => t.behavior);
  const withO = tasks.filter((t) => t.outcome);
  let behavior = null;
  if (withB.length) {
    const s = withB.reduce((a, t) => {
      a.tool += t.behavior.toolCalls; a.rework += t.behavior.reworkLoops; a.first += t.behavior.firstTryPass ? 1 : 0; return a;
    }, { tool: 0, rework: 0, first: 0 });
    behavior = {
      tasksWithData: withB.length,
      avgToolCalls: Math.round((s.tool / withB.length) * 100) / 100,
      avgReworkLoops: Math.round((s.rework / withB.length) * 100) / 100,
      firstTryPassRate: round4(s.first / withB.length),
    };
  }
  let outcome = null;
  if (withO.length) {
    outcome = {
      tasksWithOutcome: withO.length,
      passedAccepted: withO.filter((t) => t.passed && t.outcome.accepted).length,
      passedButRejected: withO.filter((t) => t.passed && !t.outcome.accepted).length,
      failedAccepted: withO.filter((t) => !t.passed && t.outcome.accepted).length,
      failedRejected: withO.filter((t) => !t.passed && !t.outcome.accepted).length,
    };
  }
  return behavior || outcome ? { behavior, outcome } : null;
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

function makeRun(label, model, scenarios, opts = {}) {
  const withAuthorship = !!opts.withAuthorship;
  const outcomes = opts.outcomes ?? {};
  const names = readdirSync(TASKS_DIR).filter((n) => statSync(join(TASKS_DIR, n)).isDirectory()).sort();
  let testGenTokens = { input: 0, output: 0, total: 0 };
  const tasks = names.map((name) => {
    const taskDir = join(TASKS_DIR, name);
    const spec = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf8"));
    const { task, testGenTokens: tg } = buildTaskResult(
      taskDir,
      spec,
      scenarios[spec.id] ?? { pass: true },
      withAuthorship,
    );
    if (outcomes[spec.id]) task.outcome = outcomes[spec.id];
    testGenTokens = addTok(testGenTokens, tg);
    return task;
  });
  const config = {
    model, temperature: 0, maxTurns: 6, attempts: 1,
    pricing: PRICING, label, harnessVersion: "0.4.0",
    verification: "confirmed", sandboxTimeoutMs: 30000,
    testMode: withAuthorship ? "both" : "human",
    verdictSource: "human",
  };
  const summary = summarize(tasks, PRICING);
  summary.testAuthorship = withAuthorship ? summarizeAuthorship(tasks, testGenTokens) : null;
  summary.judgeCalibration = withAuthorship ? summarizeCalibration(tasks) : null;
  summary.metricLayers = summarizeLayers(tasks);
  summary.provenanceCounts = {
    authored: tasks.filter((t) => (t.provenance?.source ?? "authored") === "authored").length,
    captured: tasks.filter((t) => t.provenance?.source === "captured").length,
  };
  const runId = `2026-06-20-${label}`;
  return {
    schemaVersion: 1, runId,
    startedAt: "2026-06-20T17:00:00.000Z", finishedAt: "2026-06-20T17:18:00.000Z",
    config, summary, tasks,
    _demo: true,
  };
}

// ---- scenarios -------------------------------------------------------------

// Baseline run: 13/17 pass. Four realistic failures (word-count, token-bucket,
// lru-cache, validate-ipv4); the two captured tasks pass.
const baseline = {
  "validate-ipv4": {
    pass: false,
    tags: [{ tag: "missed_edge_case", justification: "Validated octet count, digits, and range but never rejected leading zeros, so '01.2.3.4' is accepted." }],
    note: { reasoning: "I'll split on dots and check each octet is a number in 0-255.", giveUp: "Range and count tests pass, but the leading-zero cases still fail; I never rejected '01'-style octets." },
    candidate: "def is_valid_ipv4(s):\n    parts = s.split('.')\n    if len(parts) != 4:\n        return False\n    for p in parts:\n        if not p.isdigit():\n            return False\n        if int(p) > 255:\n            return False\n    return True\n",
  },
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
for (const [label, scen, withAuthorship] of [
  ["sonnet-baseline", baseline, true],
  ["sonnet-v2-prompt", v2, false],
]) {
  const run = makeRun(label, "claude-sonnet-4-6", scen, {
    withAuthorship,
    // Layer-3 outcomes ride on the baseline run (the comparison showcase).
    outcomes: withAuthorship ? DEMO_OUTCOMES : {},
  });
  const path = join(RESULTS_DIR, `${run.runId}.json`);
  writeFileSync(path, JSON.stringify(run, null, 2));
  const ta = run.summary.testAuthorship;
  const taNote = ta ? `  authorship: ${ta.llmMissed} llm-missed / ${ta.comparedTasks} compared` : "";
  const jc = run.summary.judgeCalibration;
  const jcNote = jc
    ? `\n  calibration: ${Object.entries(jc.byCategory).map(([c, x]) => `${c}=${x.band}(${x.agree}/${x.n})`).join(" ")}`
    : "";
  const ml = run.summary.metricLayers;
  const mlNote = ml?.outcome ? `\n  outcomes: passedButRejected=${ml.outcome.passedButRejected} of ${ml.outcome.tasksWithOutcome} recorded` : "";
  console.log(`wrote ${path}  pass@1 ${run.summary.passedAt1}/${run.summary.totalTasks}${taNote}${jcNote}${mlNote}`);
}
console.log("\nDemo data generated. Run `node scripts/sync-results.mjs` to publish to the dashboard.");
