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

## 6. v0.4 methodology: calibration, layers, capture

### Judge calibration

The 0.3 authorship comparison already produces, for every compared task, whether the LLM-authored suite's verdict matches the expert suite's verdict on the same solution. 0.4 treats that as calibration data for the broader question "when can an LLM's judgment about correctness be trusted?" and rolls it up per category.

- **Agreement** is exact verdict match (`agree_pass` or `agree_fail`). Disagreement in either direction (`llm_missed`, `llm_stricter`) counts against trust, because both are ways a judge diverges from ground truth.
- **Wilson 95% intervals**, not normal approximations, because per-category n is small (3 to 5 today). A category at 4/4 agreement shows an interval reaching down toward 51%, which is the honest statement of what four samples can prove.
- **Bands are decision rules, recorded in the output** so every report is self-describing: `autonomous` needs agreement at or above 0.90 AND n at or above 10; `supervised` needs 0.70; below that is `unsafe`; and below n = 3 the report says `insufficient_data` rather than pretending. With today's suite size no category can reach `autonomous`; that is intentional under-claiming, and capture is the mechanism that grows n.
- **What this is not:** calibration of a free-form LLM judge grading arbitrary output. It is calibration of LLM-authored deterministic tests against expert-authored deterministic tests, which is the closest measurable proxy this harness can compute without adding an actual judge to calibrate.

### Metric layers

- **L1 correctness** is unchanged: the hidden suite's exit code.
- **L2 behavior** is derived purely from the recorded transcript, so it costs nothing and cannot disagree with what happened: tool calls, test runs, writes, rework loops (writes made after the first test run, i.e. reactions to test feedback), and whether the first test run passed.
- **L3 outcome** is a human judgment recorded out of band (`outcomes.json`). It is deliberately not inferred from anything: acceptance is a statement about intent, and intent lives with people. The cross-layer matrix then has four cells, two of which are alarms: **passed but rejected** (the tests never encoded the real requirement) and **failed but accepted** (the tests over-constrain). Both are prompts to fix the suite, which is the point of measuring them.

### Capture and provenance

- A captured task records `provenance` (source, date, session reference, review status). Only `human_reviewed` cases belong in headline metrics; the capture tool writes `unreviewed` drafts and the promotion path is manual by design.
- The gate for promotion is the same sanity invariant as authored tasks: the session's starting code must FAIL the ratified suite and the session's final code must PASS it. A captured case that cannot satisfy that is not a valid measurement of the session it came from.
- Why the human stays in the loop: the drafted assertions are a guess about intent from the prompt and code alone. The person who accepted the final code is the only party who knows which guarantees mattered. Ratification is cheap (read, edit, rename); skipping it would turn captured cases into the very thing this project argues against, a grader whose authority nobody established.
