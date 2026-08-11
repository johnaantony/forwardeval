# FINDINGS

> **Data source:** the first real run, `results/2026-07-28-sonnet5-baseline-be74d362.json`. 17 tasks, model `claude-sonnet-5`, `--tests both`, max-turns 6, one attempt per task. Everything below is measured: real transcripts, real API token counts, real model-authored test suites, real deterministic verdicts. The seeded demo runs (`results/2026-06-20-*.json`) stay in the repo so the dashboard works without an API key; the section "What the demo data got wrong" compares the two deliberately.

## Headline: the suite saturates

- **pass@1: 17/17 (100%)**, every category, every difficulty tier, including all three `hard` tasks.
- **$0.32 for the whole run**, $0.0189 per solve, 4,919 tokens per solve, **zero wasted tokens** (nothing failed, so no budget was spent on a task that did not land).
- **1.9 minutes** of wall clock for the full suite.
- **16 of 17 tasks finished in 3 turns**: read the stub, write the solution, run the tests, done.

A perfect score is not a good benchmark result. It is the end of a benchmark's useful life. **This suite can no longer tell two frontier models apart**, and a suite that cannot separate candidates cannot inform a decision. That is the single most important finding here, and it is worth more than the 100% is.

This is benchmark saturation in miniature, the same dynamic that retired HumanEval and MBPP as frontier signals. It arrived after 17 tasks instead of 164, but the mechanism is identical: tasks authored against one generation of model capability stop discriminating against the next one.

**What follows from it:** the roadmap's Horizon 1 (repo-level, multi-file tasks) is no longer a nice-to-have, it is the only way this instrument stays alive. Single-file, single-function tasks are solved. The remaining headroom is in tasks with cross-file state, ambiguous specs, and failure modes that only appear at integration.

## Where the difficulty actually was

Pass rate says nothing when everything passes, so the discriminating signal has to come from the behavior layer instead.

| Signal | Value |
|---|---|
| First-try pass rate | 94.1% (16 of 17) |
| Average tool calls per task | 3.18 |
| Average rework loops | 0.06 |

Exactly one task required rework, and it was not one of the `hard` ones:

**`snake-to-camel` (easy, edge_cases)** took 6 turns, 2 test runs and 2 writes, the only task in the suite where the agent had to respond to a failing test and try again. Every `hard` task passed on the first attempt in 3 turns.

**The lesson: the difficulty labels no longer predict effort.** Difficulty was assigned by human intuition about what looks hard (state machines, caches, rate limiters). The agent's actual friction sat on an "easy" string-manipulation task with an under-specified edge case. When correctness saturates, behavior data is the only thing left that ranks tasks, and it ranks them differently than the labels do.

## Judge calibration: the LLM suites were pessimistic, not permissive

The run authored a fresh test suite with the model for all 17 tasks (287 LLM-written tests against 136 expert-written ones) and compared verdicts on the same solutions.

| Metric | Value |
|---|---|
| Agreement | 15/17 (**88.2%**) |
| Wilson 95% interval | 65.7% to 96.7% |
| Overall band | `supervised` |
| `llm_missed` (LLM passed, expert failed) | **0** |
| `llm_stricter` (LLM failed, expert passed) | **2** |
| pass@1 if the expert suite were the gate | 17/17 |
| pass@1 if the LLM suite were the gate | 15/17 |

**Nothing reached the `autonomous` band**, which requires both 90% agreement and n >= 10 in a category. With 17 tasks across 5 categories, per-category n runs 2 to 5, so most cells honestly report `insufficient_data` or a `supervised` band with an interval wide enough to be useless for a gating decision. That is the correct answer, not a disappointing one: **17 tasks cannot license an unsupervised LLM gate**, and the report says so instead of implying otherwise.

### Both disagreements were the LLM inventing a requirement

This is the finding worth reading the transcripts for. Neither disagreement was the LLM catching something the expert missed:

1. **`snake-to-camel` (easy, edge_cases).** The LLM suite asserted `to_camel("_leading") == "Leading"`. The solution returned `"leading"`. The prompt never specified how a leading underscore should be treated, so the LLM picked a behavior, wrote it as an assertion, and failed correct code against it.
2. **`lru-cache` (hard, refactor).** The LLM wrote 13 tests where the expert wrote 5, and one errored outright with `KeyError: 'dictionary is empty'`, testing a scenario the spec never defined.

**The pattern: `llm_stricter` here means over-constraint, not extra rigor.** When a spec is ambiguous, an LLM writing tests does not flag the ambiguity, it resolves the ambiguity silently and then enforces its private resolution as though it were the requirement. The failure is a false negative (rejecting correct work), which is the opposite direction of the failure mode this project was built to warn about.

Both diagnoses point at the same root cause: **the task prompt is under-specified**, and the expert suite quietly compensated because the same person wrote both. That is a real defect in the tasks that only surfaced because a second, independent author was asked to write tests from the prompt alone. **An LLM-authored suite is a usable spec-ambiguity detector even when it is a bad grader.**

## What the demo data got wrong

The seeded demo data was built before any real run existed, to make the dashboard demonstrable without an API key. Running the real thing contradicted it on the central point.

| | Seeded demo (`claude-sonnet-4-6`) | Real run (`claude-sonnet-5`) |
|---|---|---|
| pass@1 | 13/17 (76%) | **17/17 (100%)** |
| `llm_missed` | 3 | **0** |
| `llm_stricter` | 0 | **2** |
| Overall agreement | 82.4% | 88.2% |
| `edge_cases` band | `unsafe` (0.50) | `supervised` (0.75) |

The demo was seeded to dramatize `llm_missed`, LLM-written tests waving through broken code. **The real run produced zero of those and two of the opposite.** The direction of the error inverted.

The thesis survives (do not let an LLM decide pass or fail, because its verdict disagreed with the expert's on 2 of 17 solutions) but the *reason* changed, and a reader who only saw the demo would have learned the wrong failure mode. This is recorded rather than quietly overwritten, because the gap between plausible seeded data and one real run is the entire argument for running the real thing.

## The eval infrastructure cost more than the eval

| Spend | Tokens | Cost |
|---|---|---|
| Running the agent on 17 tasks | 83,629 (77,795 in / 5,834 out) | $0.321 |
| Authoring the LLM test suites | 47,786 (21,735 in / 26,051 out) | **$0.456** |

Authoring the suites used **36% of the tokens but 59% of the spend.** Generating tests is output-heavy (26,051 output tokens versus 5,834 for the entire eval), and output bills at 5x input, so the cost profile inverts against the token profile.

**Practical consequence:** cache and version generated suites as artifacts instead of regenerating them per run. Under the current design, adding a second model to compare against re-pays the authoring cost with no new information, since the suites do not depend on which model is being evaluated.

## Concrete, evidence-backed next steps

1. **Add repo-level and multi-file tasks (Horizon 1) before running another comparison.** At 17/17 the instrument has no resolution left; another run against another model would produce two indistinguishable 100% scores. Nothing else on the roadmap matters until this is fixed.
2. **Treat `llm_stricter` as a spec-review queue.** Both disagreements traced to prompts that failed to state a behavior (`_leading` underscores, undefined cache states). Route every `llm_stricter` result to a prompt review: either the spec gets the missing sentence, or the expert suite gets the missing assertion. This turns a grading disagreement into task maintenance, which is a better use for it than a trust score.
3. **Stop regenerating test suites per run.** Version them as artifacts, keyed by task and generator model. This removes 59% of current spend from every subsequent run.
4. **Do not ship a judge-calibration claim at this sample size.** No category reached `autonomous`; the overall interval spans 65.7% to 96.7%. Reaching n >= 10 per category needs roughly 50 tasks, and that expansion should ride along with step 1 rather than run as separate work.
5. **Record Layer 3 outcomes on the next run.** `metricLayers.outcome` is null here because no human acceptance data was recorded, so the cross-layer matrix (the `passedButRejected` cell) has nothing to show. On a saturated suite where every task passes, human acceptance is the only remaining axis that can still register a negative.

*Each of these traces to a specific number in the run file rather than an intuition about what ought to be true, which is the standard the project sets for itself and the reason the demo-versus-real correction above is documented instead of erased.*
