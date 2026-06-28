// Mirrors the harness result schema (harness/src/types.ts). Kept in sync by hand
// - the run JSON is the contract between the two packages.

export type FailureTagName =
  | "misread_spec"
  | "missed_edge_case"
  | "regression"
  | "hallucinated_api"
  | "incomplete"
  | "wrong_approach"
  | "flaky_or_timeout";

export interface FailureTag {
  tag: FailureTagName;
  justification: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface TestOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  passed: number;
  failed: number;
  total: number;
  timedOut: boolean;
  durationMs: number;
}

export type TranscriptItem =
  | { type: "system"; text: string }
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; tool: string; input: unknown; toolUseId: string }
  | { type: "tool_result"; toolUseId: string; tool: string; content: string; isError: boolean }
  | { type: "final_verification"; testOutput: TestOutput };

export interface AttemptResult {
  attempt: number;
  passed: boolean;
  turnsUsed: number;
  stopReason: string;
  tokens: TokenUsage;
  cost: number | null;
  wallClockMs: number;
  finalTestOutput: TestOutput;
  failureTags: FailureTag[];
  transcript: TranscriptItem[];
  finalCode: string;
}

export interface TaskResult {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  prompt: string;
  entryFile: string;
  testCommand: string;
  stubCode: string;
  passAt1: boolean;
  passAtK: boolean;
  representativeAttempt: number;
  passed: boolean;
  turnsUsed: number;
  tokens: TokenUsage;
  cost: number | null;
  wallClockMs: number;
  failureTags: FailureTag[];
  finalTestOutput: TestOutput;
  finalCode: string;
  attempts: AttemptResult[];
}

export interface CategoryRollup {
  total: number;
  passed: number;
  rate: number;
}

export interface RunSummary {
  totalTasks: number;
  passedAt1: number;
  passAt1Rate: number;
  passedAtK: number;
  passAtKRate: number;
  byCategory: Record<string, CategoryRollup>;
  byDifficulty: Record<string, CategoryRollup>;
  failureDistribution: Record<string, number>;
  tokens: TokenUsage;
  cost: number | null;
  avgTurnsToSolve: number;
  tokensPerSolve: number;
  costPerSolve: number | null;
  wastedTokens: number;
  wastedCost: number | null;
  totalWallClockMs: number;
}

export interface RunConfig {
  model: string;
  temperature: number;
  maxTurns: number;
  attempts: number;
  pricing: { inputPerMTok: number; outputPerMTok: number } | null;
  label: string;
  harnessVersion: string;
  verification: string;
  sandboxTimeoutMs: number;
}

export interface RunResult {
  schemaVersion: number;
  runId: string;
  startedAt: string;
  finishedAt: string;
  config: RunConfig;
  summary: RunSummary;
  tasks: TaskResult[];
  _demo?: boolean;
}

export interface ManifestEntry {
  runId: string;
  file: string;
  label: string;
  model: string;
  startedAt: string;
  passAt1Rate: number;
  totalTasks: number;
  demo: boolean;
}
