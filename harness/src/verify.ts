import { runInSandbox } from "./sandbox.js";
import type { TestOutput } from "./types.js";

/**
 * Authoritative final verification.
 *
 * The harness runs the FULL hidden test suite itself and treats the process
 * exit code as the single source of truth for pass/fail. We never trust the
 * agent's own run_tests call as the verdict - the agent could have edited the
 * test file, run a subset, or stopped mid-edit.
 *
 * exitCode === 0  -> PASS (deterministic)
 * exitCode !== 0  -> FAIL
 */
export async function verify(opts: {
  taskDir: string;
  testCommand: string;
  timeoutMs: number;
  /** the agent's final candidate file(s), overlaid onto a clean task copy */
  overlay: Record<string, string>;
}): Promise<TestOutput> {
  const r = await runInSandbox({
    sourceDir: opts.taskDir,
    command: opts.testCommand,
    timeoutMs: opts.timeoutMs,
    overlay: opts.overlay,
  });

  const counts = parseTestCounts(r.stdout, r.stderr, r.exitCode);
  return {
    stdout: r.stdout,
    stderr: r.stderr,
    exitCode: r.exitCode,
    passed: counts.passed,
    failed: counts.failed,
    total: counts.total,
    timedOut: r.timedOut,
    durationMs: r.durationMs,
  };
}

/**
 * Best-effort parse of test counts for display only. The verdict NEVER depends
 * on this - it depends on exitCode. Supports Python unittest and pytest output.
 */
export function parseTestCounts(
  stdout: string,
  stderr: string,
  exitCode: number,
): { passed: number; failed: number; total: number } {
  const text = `${stdout}\n${stderr}`;

  // pytest summary line, e.g. "3 passed, 1 failed in 0.04s"
  const pyPassed = /(\d+) passed/.exec(text);
  const pyFailed = /(\d+) failed/.exec(text);
  const pyErrors = /(\d+) error/.exec(text);
  if (pyPassed || pyFailed) {
    const passed = pyPassed ? Number(pyPassed[1]) : 0;
    const failed =
      (pyFailed ? Number(pyFailed[1]) : 0) +
      (pyErrors ? Number(pyErrors[1]) : 0);
    return { passed, failed, total: passed + failed };
  }

  // Python unittest: "Ran 5 tests in 0.001s" then "OK" or
  // "FAILED (failures=2, errors=1)"
  const ran = /Ran (\d+) tests?/.exec(text);
  if (ran) {
    const total = Number(ran[1]);
    const failMatch = /FAILED \(([^)]*)\)/.exec(text);
    let failed = 0;
    if (failMatch) {
      const f = /failures=(\d+)/.exec(failMatch[1]);
      const e = /errors=(\d+)/.exec(failMatch[1]);
      failed = (f ? Number(f[1]) : 0) + (e ? Number(e[1]) : 0);
    }
    return { passed: total - failed, failed, total };
  }

  // Fallback: we couldn't parse counts. Infer pass/fail from exit code only.
  return exitCode === 0
    ? { passed: 1, failed: 0, total: 1 }
    : { passed: 0, failed: 1, total: 1 };
}
