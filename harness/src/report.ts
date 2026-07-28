import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { emptyTokens, addTokens, costFor } from "./cost.js";
import type {
  RunResult,
  RunSummary,
  TaskResult,
  RunConfig,
  CalibrationBand,
  CalibrationCell,
  CategoryRollup,
  JudgeCalibration,
  MetricLayersSummary,
  TestAuthorshipSummary,
  TokenUsage,
} from "./types.js";

// ---------------------------------------------------------------------------
// v0.4: judge calibration
// ---------------------------------------------------------------------------

/**
 * Band cutoffs. Recorded verbatim in the output so every report is
 * self-describing. minN keeps small samples honest: below it we say
 * "insufficient data" instead of pretending three tasks are a measurement.
 */
export const CALIBRATION_THRESHOLDS = {
  autonomous: 0.9,
  supervised: 0.7,
  minN: 3,
  minNAutonomous: 10,
};

/** Wilson 95% score interval - honest uncertainty for small n. */
function wilson(agree: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = agree / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: round4(Math.max(0, center - half)), high: round4(Math.min(1, center + half)) };
}

function bandFor(rate: number, n: number): CalibrationBand {
  const t = CALIBRATION_THRESHOLDS;
  if (n < t.minN) return "insufficient_data";
  if (rate >= t.autonomous && n >= t.minNAutonomous) return "autonomous";
  if (rate >= t.supervised) return "supervised";
  return "unsafe";
}

function cell(agree: number, n: number): CalibrationCell {
  const rate = n ? round4(agree / n) : 0;
  return { n, agree, agreementRate: rate, ci: wilson(agree, n), band: bandFor(rate, n) };
}

/**
 * Turn the per-task authorship comparison into per-category trust scores:
 * WHERE can an LLM-authored suite be trusted, instead of a blanket yes/no.
 * The agreement being measured is "LLM suite verdict == expert suite verdict"
 * on the same solution, which is exactly the error mode of an LLM judge.
 */
export function summarizeJudgeCalibration(
  tasks: TaskResult[],
): JudgeCalibration | null {
  let n = 0;
  let agree = 0;
  const catN: Record<string, number> = {};
  const catAgree: Record<string, number> = {};

  for (const t of tasks) {
    const ta = t.attempts[0]?.testAuthorship ?? t.testAuthorship;
    if (!ta || !ta.human || !ta.llm) continue;
    n += 1;
    catN[t.category] = (catN[t.category] ?? 0) + 1;
    const agreed = ta.agreement === "agree_pass" || ta.agreement === "agree_fail";
    if (agreed) {
      agree += 1;
      catAgree[t.category] = (catAgree[t.category] ?? 0) + 1;
    }
  }
  if (n === 0) return null;

  const byCategory: Record<string, CalibrationCell> = {};
  for (const c of Object.keys(catN)) {
    byCategory[c] = cell(catAgree[c] ?? 0, catN[c]);
  }
  return {
    overall: cell(agree, n),
    byCategory,
    thresholds: CALIBRATION_THRESHOLDS,
  };
}

// ---------------------------------------------------------------------------
// v0.4: metric layers (behavior + outcome)
// ---------------------------------------------------------------------------

export function summarizeMetricLayers(tasks: TaskResult[]): MetricLayersSummary | null {
  const withBehavior = tasks.filter((t) => t.behavior);
  const withOutcome = tasks.filter((t) => t.outcome);
  if (withBehavior.length === 0 && withOutcome.length === 0) return null;

  let behavior: MetricLayersSummary["behavior"] = null;
  if (withBehavior.length > 0) {
    const sum = withBehavior.reduce(
      (acc, t) => {
        acc.tool += t.behavior!.toolCalls;
        acc.rework += t.behavior!.reworkLoops;
        acc.firstTry += t.behavior!.firstTryPass ? 1 : 0;
        return acc;
      },
      { tool: 0, rework: 0, firstTry: 0 },
    );
    behavior = {
      tasksWithData: withBehavior.length,
      avgToolCalls: round2(sum.tool / withBehavior.length),
      avgReworkLoops: round2(sum.rework / withBehavior.length),
      firstTryPassRate: round4(sum.firstTry / withBehavior.length),
    };
  }

  let outcome: MetricLayersSummary["outcome"] = null;
  if (withOutcome.length > 0) {
    outcome = {
      tasksWithOutcome: withOutcome.length,
      passedAccepted: withOutcome.filter((t) => t.passed && t.outcome!.accepted).length,
      passedButRejected: withOutcome.filter((t) => t.passed && !t.outcome!.accepted).length,
      failedAccepted: withOutcome.filter((t) => !t.passed && t.outcome!.accepted).length,
      failedRejected: withOutcome.filter((t) => !t.passed && !t.outcome!.accepted).length,
    };
  }

  return { behavior, outcome };
}

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
    judgeCalibration:
      config.testMode === "human" ? null : summarizeJudgeCalibration(tasks),
    metricLayers: summarizeMetricLayers(tasks),
    provenanceCounts: {
      authored: tasks.filter((t) => (t.provenance?.source ?? "authored") === "authored").length,
      captured: tasks.filter((t) => t.provenance?.source === "captured").length,
    },
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
