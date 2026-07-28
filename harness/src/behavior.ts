import type { BehaviorStats, TranscriptItem } from "./types.js";

/**
 * Layer-2 behavior derivation (v0.4).
 *
 * Everything here is computed from the transcript the harness already records;
 * no new instrumentation, no extra API calls. Pass/fail says whether the agent
 * got there; these stats say HOW: first try or thrash, focused edits or a
 * write-test-write loop.
 */
export function deriveBehavior(
  transcript: TranscriptItem[],
  turnsUsed: number,
  passedFallback: boolean,
): BehaviorStats {
  let toolCalls = 0;
  let testRuns = 0;
  let writes = 0;
  let reworkLoops = 0;
  let firstTestExitZero: boolean | null = null;
  let seenFirstTestRun = false;

  for (const item of transcript) {
    if (item.type === "tool_use") {
      toolCalls += 1;
      if (item.tool === "run_tests") {
        testRuns += 1;
        seenFirstTestRun = true;
      } else if (item.tool === "write_file") {
        writes += 1;
        // A write AFTER the first test run is rework: the agent is reacting to
        // test feedback rather than landing the fix on its initial read.
        if (seenFirstTestRun) reworkLoops += 1;
      }
    } else if (
      item.type === "tool_result" &&
      item.tool === "run_tests" &&
      firstTestExitZero === null
    ) {
      firstTestExitZero = /exit_code:\s*0\b/.test(item.content);
    }
  }

  return {
    toolCalls,
    testRuns,
    writes,
    reworkLoops,
    // If the agent never ran tests, fall back to the final verdict: a pass
    // without a single test run is still a first-try pass (and vice versa).
    firstTryPass: firstTestExitZero ?? passedFallback,
    turnsUsed,
  };
}
