import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { emptyTokens, addTokens, costFor } from "./cost.js";
import type {
  RunResult,
  RunSummary,
  TaskResult,
  RunConfig,
  CategoryRollup,
} from "./types.js";

/** Compute the run-level summary (incl. the Token-ROI block) from task results. */
export function summarize(tasks: TaskResult[], config: RunConfig): RunSummary {
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
