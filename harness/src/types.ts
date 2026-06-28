/**
 * Shared data contract for ForwardEval.
 *
 * Everything the dashboard renders is defined here. A result JSON file
 * (results/<run-id>.json) is the single artifact that closes the lineage
 * loop: insight -> run file -> captured transcript/tests -> original inputs.
 */

export type Category =
  | "bug_fix"
  | "feature_add"
  | "refactor"
  | "edge_cases"
  | "algo";

export type Difficulty = "easy" | "medium" | "hard";

/** The fixed failure taxonomy. The classifier may ONLY emit these tags. */
export type FailureTagName =
  | "misread_spec" // solved the wrong problem
  | "missed_edge_case" // happy path ok, edge case failed
  | "regression" // fixed the target but broke a passing test
  | "hallucinated_api" // used a function/module that doesn't exist
  | "incomplete" // gave up / left a TODO / didn't finish
  | "wrong_approach" // fundamentally wrong algorithm/strategy
  | "flaky_or_timeout"; // nondeterministic or exceeded timeout

export const FAILURE_TAGS: FailureTagName[] = [
  "misread_spec",
  "missed_edge_case",
  "regression",
  "hallucinated_api",
  "incomplete",
  "wrong_approach",
  "flaky_or_timeout",
];

export interface FailureTag {
  tag: FailureTagName;
  justification: string;
}

/** A task definition, read from tasks/<id>/task.json. */
export interface TaskSpec {
  id: string;
  title: string;
  language: "python";
  category: Category;
  difficulty: Difficulty;
  prompt: string;
  entry_file: string; // e.g. "solution_stub.py"
  test_command: string; // e.g. "python3 test_suite.py"
  /**
   * Files that must stay HIDDEN from the agent (the verifier). They are removed
   * from the agent's workspace and overlaid only at test-execution time, so the
   * agent can run the tests and see failures but cannot read or game the test
   * source. Defaults to ["test_suite.py"] when omitted.
   */
  hidden_files?: string[];
}

export const DEFAULT_HIDDEN_FILES = ["test_suite.py"];

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

/** Result of running the test command in the sandbox. */
export interface TestOutput {
  stdout: string;
  stderr: string;
  exitCode: number; // 0 = all tests passed (the deterministic verdict)
  passed: number; // parsed test counts (best-effort, for display)
  failed: number;
  total: number;
  timedOut: boolean;
  durationMs: number;
}

/** One item in the agent transcript - rendered turn-by-turn in the viewer. */
export type TranscriptItem =
  | { type: "system"; text: string }
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; tool: string; input: unknown; toolUseId: string }
  | {
      type: "tool_result";
      toolUseId: string;
      tool: string;
      content: string;
      isError: boolean;
    }
  | { type: "final_verification"; testOutput: TestOutput };

/** One attempt at a task (pass@k stores multiple). */
export interface AttemptResult {
  attempt: number;
  passed: boolean; // authoritative - from final verification exitCode === 0
  turnsUsed: number;
  stopReason: string; // tests_passed | agent_done | turn_cap | error
  tokens: TokenUsage;
  cost: number | null; // null when no pricing configured
  wallClockMs: number;
  finalTestOutput: TestOutput;
  failureTags: FailureTag[]; // [] when passed
  transcript: TranscriptItem[];
  finalCode: string;
}

/** Rolled-up result for one task (representative attempt + all attempts). */
export interface TaskResult {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  prompt: string;
  entryFile: string;
  testCommand: string;
  stubCode: string;

  passAt1: boolean; // attempt 0 passed
  passAtK: boolean; // any attempt passed
  representativeAttempt: number; // index shown in the UI

  // convenience rollups for the representative attempt:
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

export interface Pricing {
  /** USD per 1,000,000 input tokens. */
  inputPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTok: number;
}

export interface RunConfig {
  model: string;
  temperature: number;
  maxTurns: number;
  attempts: number; // k for pass@k (default 1)
  pricing: Pricing | null; // null => Cost view disabled, Tokens still shown
  label: string; // human label for run comparison (e.g. "sonnet-baseline")
  harnessVersion: string;
  /** "confirmed" (tests run locally) - batch/headless edge cases can differ. */
  verification: "confirmed" | "unconfirmed";
  sandboxTimeoutMs: number;
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
  failureDistribution: Record<string, number>; // tag -> count
  tokens: TokenUsage;
  cost: number | null;
  // --- Token ROI block (the outcome-pricing lens) ---
  avgTurnsToSolve: number; // mean turns among passed tasks
  tokensPerSolve: number; // total tokens / tasks passed
  costPerSolve: number | null; // total cost / tasks passed
  wastedTokens: number; // tokens spent on tasks that ultimately failed
  wastedCost: number | null;
  totalWallClockMs: number;
}

export interface RunResult {
  schemaVersion: 1;
  runId: string;
  startedAt: string; // ISO
  finishedAt: string;
  config: RunConfig;
  summary: RunSummary;
  tasks: TaskResult[];
}
