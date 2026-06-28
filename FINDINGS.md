# FINDINGS

> **Data source:** the committed **demo runs** (`results/2026-06-20-sonnet-baseline.json` and `results/2026-06-20-sonnet-v2-prompt.json`). In these files the **pass/fail verdicts and test output are real** (Python executed against the hidden suites); token counts and transcripts are simulated. Regenerate this document from a live run with `npm run eval -- --label sonnet-baseline`, then update the numbers below. The *shape* of the analysis (and the improvement ideas) is what this file is meant to demonstrate.

## Headline (baseline run)

- **pass@1: 12/15 (80.0%)**, model `claude-sonnet-4-6`, max-turns 6, temperature 0.
- **Cost/solve:** ~$0.09 · **wasted spend** (tokens on the 3 failures): ~13.7k tokens.
- A prompt-tuned candidate (`sonnet-v2-prompt`) reached **14/15 (93%)**, but it introduced **1 regression** while fixing 3 tasks (see "Run comparison").

## Pass rate by difficulty (the clearest signal)

| Difficulty | Pass | Rate |
|---|---|---|
| easy | 5/5 | 100% |
| medium | 6/7 | 86% |
| **hard** | **1/3** | **33%** |

**The cliff is at `hard`.** Easy and medium are nearly saturated; the differentiating signal lives entirely in hard, multi-step, stateful tasks. *Implication for an eval roadmap: invest new tasks at the hard tier, because easy tasks no longer discriminate between model versions.*

## Pass rate by category

| Category | Pass | Rate |
|---|---|---|
| bug_fix | 2/2 | 100% |
| algo | 4/4 | 100% |
| feature_add | 3/4 | 75% |
| edge_cases | 2/3 | 67% |
| **refactor** | **1/2** | **50%** |

`refactor` is the weakest category, consistent with the failure modes below (refactors are where you "fix one thing and break another").

## Top 3 capability gaps observed

1. **Stateful and temporal logic (wrong_approach).** The token-bucket rate limiter failed: the agent tracked elapsed time but *reset the bucket to full* on each call instead of accruing fractional tokens, so the refill-cap and sequence cases broke. Agents handle pure functions well but stumble on **state that evolves across calls**.
2. **Fix-one-break-another (regression).** The LRU cache failed: the agent correctly added recency refresh on `get` but **forgot to refresh on update**, breaking a previously-passing case. The happy path looked solved; a hidden invariant regressed. This is the failure humans miss most in review.
3. **Incomplete edge-case coverage (missed_edge_case).** Word-count failed: casing was handled but **trailing punctuation stripping was not**, so `cat,` and `cat` counted separately. Classic "handled what the prompt said, missed what it implied."

## Run comparison: baseline → v2-prompt

Adding an explicit "enumerate the edge cases before you code, and re-run the full suite after each change" instruction:
- **Fixed (fail→pass):** word-count, token-bucket, lru-cache (the edge-case + regression failures).
- **Regressed (pass→fail):** roman-numerals. The agent over-applied a string-replace shortcut and emitted `IM` for 999. **A prompt change that helped overall still caused a regression**, which is exactly the signal a PM must catch before shipping. Net change is +2 tasks, but ship review should ask whether the roman-numerals regression is acceptable.

## 3 concrete, evidence-backed improvement ideas

1. **Add a forced self-review turn before "done."** Two of the three failures (the LRU regression and the word-count edge case) were *near-misses* the agent could have caught by re-reading the spec and re-running the full suite. A harness or prompt convention that requires "list the edge cases, then verify all pass" is cheap and directly targets the two most common failure tags. (v2 demonstrates both the upside and the regression risk to watch.)
2. **Give the agent a scratchpad for state machines.** The token-bucket failure suggests agents reason poorly about evolving state in their head. Prompting an explicit "write the state-transition table first" step should lift the hard/stateful tier where the discriminating signal lives.
3. **Weight the suite toward `hard` and `refactor`.** Easy and medium are saturated (100% and 86%) and no longer separate model versions. To keep the eval *sensitive* to future changes, the roadmap should add hard, multi-file-flavored, and refactor tasks: the two segments where the pass rate sits at 33 to 50% and movement is measurable.

*These double as interview material: each is an articulated, evidence-backed improvement idea tied to a specific transcript and failure tag.*
