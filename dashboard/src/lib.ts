import type { FailureTagName } from "./types";

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtCost(n: number | null): string {
  if (n === null) return "-";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export const FAILURE_LABELS: Record<FailureTagName, string> = {
  misread_spec: "Misread spec",
  missed_edge_case: "Missed edge case",
  regression: "Regression",
  hallucinated_api: "Hallucinated API",
  incomplete: "Incomplete",
  wrong_approach: "Wrong approach",
  flaky_or_timeout: "Flaky / timeout",
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];

/**
 * Minimal LCS-based line diff for the stub→final code view. Returns lines
 * tagged as unchanged / added / removed. No dependency needed.
 */
export type DiffLine = { type: "same" | "add" | "del"; text: string };

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ type: "same", text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: A[i] });
      i++;
    } else {
      out.push({ type: "add", text: B[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: A[i++] });
  while (j < m) out.push({ type: "add", text: B[j++] });
  return out;
}
