import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { emptyTokens, addTokens, costFor } from "./cost.js";
import type {
  RunResult,
  RunSummary,
  TaskResult,
  RunConfig,
  CategoryRollup,
  TestAuthorshipSummary,
  TokenUsage,
} from "./types.js";

/**
 * Roll up the human-vs-LLM test authorship comparison across tasks.
 * Returns null when no comparison was run (testMode === "human").
 */
function summarizeTestAuthorship(
  tasks: TaskResult[],
  config: RunConfig,
  testGenTokens: TokenUsage,
): TestAuthorshipSummary | null {
  if (config.testMode === "human") return null;

  let comparedTasks = 0;
  let agree = 0;
  let llmMissed = 0;
  let llmStricter = 0;
  let humanTestCount = 0;
  let llmTestCount = 0;
  let humanPassAt1 = 0;
  let llmPassAt1 = 0;

  for (const t of tasks) {
    // Use attempt 0 (pass@1) where available, else the representative rollup.
    const ta = t.attempts[0]?.testAuthorship ?? t.testAuthorship;
    if (!ta || !ta.human || !ta.llm) continue;
    comparedTasks += 1;
    humanTestCount += ta.human.output.total;
    llmTestCount += ta.llm.output.total;
    if (ta.human.verdict) humanPassAt1 += 1;
    if (ta.llm.verdict) llmPassAt1 += 1;
    switch (ta.agreement) {
      case "agree_pass":
      case "agree_fail":
        agree += 1;
        break;
      case "llm_missed":
        llmMissed += 1;
        break;
      case "llm_stricter":
        llmStricter += 1;
        break;
    }
  }

  return {
    mode: config.testMode,
    verdictSource: config.verdictSource,
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
    testGenCost: costFor(testGenTokens, config.pricing),
  };
}

/** Compute the run-level summary (incl. the Token-ROI block) from task results. */
export function summarize(
  tasks: TaskResult[],
  config: RunConfig,
  testGenTokens: TokenUsage = emptyTokens(),
): RunSummary {
  const total = tasks.length;
  const passedAt1 = tasks.filter((t) => t.passAt1).length;
  const passedAtK = tasks.filter((t) => t.passAtK).length;

  const byCategory: Record<string, CategoryRollup> = {};
  const byDifficulty: Record<string, CategoryRollup> = {};
  const failureDistribution: Record<string, number> = {};

  let tokens = emptyTokens();
  let wastedTokens = 0;
  let turnsToSolveSum = 0;
  let solvedForTurns = 0;
  let totalWallClockMs = 0;

  for (const t of tasks) {
    bump(byCategory, t.category, t.passed);
    bump(byDifficulty, t.difficulty, t.passed);

    tokens = addTokens(tokens, t.tokens);
    totalWallClockMs += t.wallClockMs;

    if (t.passed) {
      turnsToSolveSum += t.turnsUsed;
      solvedForTurns += 1;
    } else {
      wastedTokens += t.tokens.total;
      for (const tag of t.failureTags) {
        failureDistribution[tag.tag] = (failureDistribution[tag.tag] ?? 0) + 1;
      }
    }
  }

  finalizeRates(byCategory);
  finalizeRates(byDifficulty);

  const cost = costFor(tokens, config.pricing);
  const tokensPerSolve = passedAt1 > 0 ? Math.round(tokens.total / passedAt1) : 0;
  const costPerSolve =
    cost !== null && passedAt1 > 0 ? round6(cost / passedAt1) : null;
  const wastedCost = costFor({ input: 0, output: 0, total: wastedTokens }, config.pricing);

  return {
    totalTasks: total,
    passedAt1,
    passAt1Rate: total ? round4(passedAt1 / total) : 0,
    passedAtK,
    passAtKRate: total ? round4(passedAtK / total) : 0,
    byCategory,
    byDifficulty,
    failureDistribution,
    tokens,
    cost,
    avgTurnsToSolve: solvedForTurns ? round2(turnsToSolveSum / solvedForTurns) : 0,
    tokensPerSolve,
    costPerSolve,
    wastedTokens,
    // wastedCost is a {total}-only proxy; treat input/output split as output-ish.
    wastedCost: wastedCost,
    totalWallClockMs,
    testAuthorship: summarizeTestAuthorship(tasks, config, testGenTokens),
  };
}

function bump(map: Record<string, CategoryRollup>, key: string, passed: boolean) {
  const r = (map[key] ??= { total: 0, passed: 0, rate: 0 });
  r.total += 1;
  if (passed) r.passed += 1;
}

function finalizeRates(map: Record<string, CategoryRollup>) {
  for (const k of Object.keys(map)) {
    const r = map[k];
    r.rate = r.total ? round4(r.passed / r.total) : 0;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export async function writeRunResult(
  resultsDir: string,
  run: RunResult,
): Promise<string> {
  await mkdir(resultsDir, { recursive: true });
  const path = join(resultsDir, `${run.runId}.json`);
  await writeFile(path, JSON.stringify(run, null, 2), "utf8");
  return path;
}
