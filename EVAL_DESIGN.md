# EVAL_DESIGN: ForwardEval methodology

A PRD-style description of *how* ForwardEval measures coding-agent performance and *why a PM can make a ship decision from it*.

## 1. Problem

Teams shipping LLM-powered coding features cannot tell, rigorously, whether a model/prompt/agent change improved real coding performance. Human spot-checking doesn't scale, is biased, and misses regressions (the agent fixes A but silently breaks B). The cost of being wrong is shipping a model that quietly got worse and learning it from customers.

## 2. Goals / Non-goals

**Goals**
- Deterministic, reproducible pass/fail for each task (real tests, sandboxed).
- A genuinely agentic loop (multi-turn tool use), so we measure *getting to working code*, not one-shot generation.
- Transcript-level failure analysis to surface *why* and *where* it fails.
- Ship-relevant synthesis: pass rate by category/difficulty, failure distribution, run-to-run comparison, and **token ROI**.

**Non-goals**
- Not a leaderboard or a replacement for SWE-bench.
- Not LLM-as-judge for correctness (used only to explain failures).
- Not repo-level engineering (single-file tasks by design; see ROADMAP).

## 3. Measurement methodology

### Unit of measurement
One **task** = one self-contained coding problem with a hidden `unittest` verifier. A task is *solved* iff the verifier process exits `0`.

### The agentic loop
For each task the harness exposes three tools to Claude (`read_file`, `write_file`, `run_tests`) and runs up to `--max-turns` turns. The loop ends when tests pass, the agent stops calling tools, or the cap is hit. Tokens, turns, wall-clock, and the full transcript are captured.

### Hidden tests & anti-gaming
The verifier file is **excluded from the agent's workspace** and overlaid only at execution time. The agent can *run* tests and read failures, but cannot read the test source to hard-code answers. The agent also cannot affect the verdict by editing test files: final verification runs on a **clean copy** of the task with only the agent's entry file overlaid.

### Authoritative verification
The agent's own `run_tests` is *not* trusted as the verdict. After the loop, the harness independently runs the full hidden suite and uses that exit code. This eliminates mid-edit states, partial runs, and tampering.

### Sandboxing
Candidate code runs in an isolated temp dir, in a child process, with a hard timeout and a process-group kill on expiry. Network is denied best-effort (macOS `sandbox-exec`, Linux `unshare -n`), with graceful fallback recorded in the run. Candidate code is never `eval()`'d in the harness process.

## 4. Metrics: what each means and its failure modes

| Metric | Definition | Watch out for |
|---|---|---|
| **pass@1** | fraction solved on the first attempt | the headline; small suites → wide confidence intervals |
| **pass@k** | solved within k attempts (`--attempts`) | rewards luck; report alongside pass@1, not instead |
| **pass rate by category/difficulty** | rollups | a flat average can hide a category collapse |
| **failure distribution** | counts per failure tag | classifier is an LLM → treat as directional, not exact |
| **Tokens** | raw input/output from API usage | always exact, needs no config |
| **Cost** | Tokens × price | needs prices; null-safe (UI shows Tokens only) |
| **cost-per-solve** | total cost ÷ tasks passed | the most honest efficiency number |
| **wasted tokens** | tokens spent on tasks that still failed | the spend that bought nothing |
| **avg turns-to-solve** | mean turns among solved | a proxy for loop efficiency |

## 5. The trust argument (why a PM can decide from this)

1. **The verdict is deterministic and independent.** Same code → same result, decided by tests the agent can't see or tamper with, re-run on a clean copy. A 2-point move reflects the model, not jitter in the ruler.
2. **Failures are explainable, not just counted.** Every regression links to a transcript and a tagged reason, so "pass rate dropped 6 points" becomes "refactor regressions doubled; here are the three transcripts."
3. **Cost is first-class.** "Better at what price?" is answerable, so the decision weighs accuracy *and* economics, which is the actual ship calculus.
4. **It's auditable.** Every run records its config; anyone can reproduce or inspect it. No black-box judge, no vendor telemetry.

The honest boundary: this measures the *correctness* of self-contained tasks. Whether shipped code is *valuable to customers* is a different layer (adoption, completion rate), addressed as the Layer 2 vision in [ROADMAP.md](ROADMAP.md).
