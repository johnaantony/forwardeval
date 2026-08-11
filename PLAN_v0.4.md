# ForwardEval v0.4 - "Closing the loop"

**Status:** shipped in 0.4.0 ([PR #2](https://github.com/johnaantony/forwardeval/pull/2), merged 2026-07-28)
**Current shipped version:** 0.4.0

> This document is kept as written, as a record of what was planned before the work started. The section immediately below records what actually shipped and where reality diverged from the plan. Everything from "The through-line" onward is the original plan text, unedited.

---

## Outcome: what shipped, and what the first real run changed

All four capabilities shipped, and every item in the definition of done was met.

| Planned | Shipped | Note |
|---|---|---|
| Judge calibration, Wilson CI, per-category bands | yes | `report.ts`, `types.ts`, dashboard tab renamed |
| Calibration drift in Run Comparison | yes | |
| L2 behavior stats from existing transcripts | yes | `behavior.ts`, no new inputs required |
| L3 outcomes sidecar + cross-layer matrix | yes | `scripts/outcome.mjs`, `outcomes.json` |
| Session capture with human ratification gate | yes | `harness/src/capture.ts`, `npm run capture` |
| Two captured tasks promoted | yes | `slugify-url-handles`, `retry-with-backoff`; suite is now 17 |
| Demo shows all three with no API key | yes | `passedButRejected` = 1, one `unsafe` band, 2 captured tasks |
| README "What's new in 0.4", closed-loop diagram, CHANGELOG, EVAL_DESIGN methodology | yes | all six comprehension items |

**Where the plan was wrong.** The plan's honest-limit section anticipated the risk of over-claiming from small samples, and that held up. What it did not anticipate is the direction of the error the real data would show.

The plan assumed `llm_missed` (LLM-authored tests passing code an expert suite catches) was the failure mode worth instrumenting, and the seeded demo data was built to dramatize it with 3 such cases. The first real run produced **`llm_missed` = 0 and `llm_stricter` = 2**: the LLM suites never waved through broken code, and twice they failed correct code by inventing a requirement the prompt never stated. The layer was worth building, but the story it tells is the opposite of the one the plan expected.

The run also revealed something outside the plan's scope entirely: at 17/17 pass@1 on `claude-sonnet-5`, **the suite saturates and no longer discriminates between models**. That makes Horizon 1 (repo-level, multi-file tasks) the blocking priority rather than a later nice-to-have.

Full numbers and analysis: [FINDINGS.md](FINDINGS.md).

---

## The through-line

Every capability in this release answers one question:

> **Where does the metric say green when the truth is red?**

ForwardEval v0.3 already answers one version of that. The `llm_missed` metric finds cases where an LLM-authored test suite passes code that an expert suite catches as broken. v0.4 extends the same instinct to two more layers, and then closes the loop so reality can feed back into the suite:

| Layer | The green claim | The red truth | Metric |
|---|---|---|---|
| Test authorship (v0.3) | LLM-written tests pass | Expert tests fail | `llm_missed` |
| Judge calibration (new) | An LLM judge agrees with the verdict | It only agrees on some task types | `agreementRate` by category |
| Outcome (new) | Tests pass | A human rejected the change anyway | `passedButRejected` |
| Capture (new) | The suite is green | The suite never asked the question | provenance: captured vs authored |

That is the release in one sentence: **v0.3 measured whether the tests were right; v0.4 measures whether the whole eval is telling you the truth, and lets real sessions correct it.**

---

## Capability 1: Judge calibration

**The problem it solves.** "Never let an LLM decide pass/fail" is a good default and a bad absolute. Teams are going to use LLM judges regardless, because deterministic tests do not exist for every question. What they lack is any evidence about *when* a judge can be trusted. Today that decision is made on vibes.

**The reframe.** ForwardEval already runs both an expert suite and an LLM-authored suite against the same solution. That comparison is not just a curiosity, it is calibration data. v0.4 turns it into a per-category trust score, so "can I use a judge here?" becomes an evidence-backed answer instead of an opinion.

**What ships.**

- A calibration rollup computed from the existing `--tests both` run data. No new inputs required.
- Per-category agreement rate with a Wilson score interval, because the sample size per category is small and the report must say so rather than over-claim.
- A recommendation band per category:

| Band | Condition | Meaning |
|---|---|---|
| `autonomous` | agreement >= 0.90 and n >= 10 | A judge can gate this category unsupervised |
| `supervised` | agreement 0.70 to 0.90 | Use a judge for triage, a human confirms |
| `unsafe` | agreement < 0.70 | Deterministic verification only |

- Calibration drift across runs, surfaced in Run Comparison, so a model or prompt change that degrades judge reliability is visible.

**Data model** (`RunSummary`):

```ts
judgeCalibration: {
  overall: { n: number; agree: number; agreementRate: number };
  byCategory: Record<string, {
    n: number;
    agree: number;
    agreementRate: number;
    ci: { low: number; high: number };   // Wilson, 95%
    band: "autonomous" | "supervised" | "unsafe" | "insufficient_data";
  }>;
  thresholds: { autonomous: number; supervised: number; minN: number };
}
```

**Dashboard.** Rename the "Test authorship" tab to **"Judge calibration"** and make it two stacked panels: the trust-score table on top (the answer), the existing authorship comparison below (the evidence for it). This keeps one concept in one place rather than splitting related data across tabs.

**Honest limit to state in the UI.** With 15 tasks across 5 categories, per-category n is roughly 3. The report must render `insufficient_data` rather than a band whenever n is below the minimum, and the interval must be shown, not hidden. Under-claiming here is the point.

---

## Capability 2: Metric layers (behavior and outcome)

**The problem it solves.** A binary pass/fail hides two things that matter: *how* the agent got there, and whether a human actually kept the result. A task can pass its tests and still be work you would reject.

**The three layers.**

| Layer | Question | Source |
|---|---|---|
| L1 Correctness (shipped) | Did the tests pass? | Deterministic hidden suite |
| L2 Behavior (new) | How efficiently did it get there? | Derived from the existing transcript, no new input |
| L3 Outcome (new) | Did a human keep the change? | Small sidecar file the user fills in |

**L2 is free.** Every signal below is already recoverable from transcripts ForwardEval stores today:

- `toolCalls`: total tool invocations
- `reworkLoops`: count of write to test to write cycles (thrash)
- `firstTryPass`: did the first `run_tests` call succeed
- `turnsUsed`: already captured

**L3 needs one small input.** An `outcomes.json` sidecar, or a one-line CLI write:

```bash
npm run outcome -- --task word-count-edgecases --rejected --note "correct but rewrote the public API"
```

```json
{ "word-count-edgecases": { "accepted": false, "reworkRequired": true, "note": "..." } }
```

**The headline view: the cross-layer matrix.**

|  | Human accepted | Human rejected |
|---|---|---|
| **Tests passed** | true green | **passed but rejected** |
| **Tests failed** | over-strict test | true red |

`passedButRejected` is the metric that earns this capability. It is the same shape of insight as `llm_missed`, one layer further out: the instrument said green, the person said no. It is also the honest counterweight to a pure deterministic thesis, because it shows the places tests alone cannot reach.

**Dashboard.** Add a Metric Layers card to Overview (three tiers, with `passedButRejected` styled as the alert), and per-task behavior stats in Task Explorer next to the existing verdict.

---

## Capability 3: Session capture (closed loop)

**The problem it solves.** Today the entire suite is synthetic and frozen. Fifteen hand-authored tasks, written once. Meanwhile every real coding session produces exactly the thing the suite lacks: a task someone actually cared about, and a definition of done that emerged from doing the work. None of that reaches the eval. When the target moves in a real session, a frozen suite keeps grading yesterday's target and reports green with total confidence.

**What it does.** Turn a real session into a permanent eval case, with a human ratifying what "done" means.

```
real session  ->  capture  ->  LLM drafts a candidate suite  ->  HUMAN reviews and edits  ->  sanity check  ->  promoted to the regression suite
```

The human step is not a limitation to apologize for, it is the thesis. The tool can extract the task and draft assertions; only the person who did the work knows what the result must guarantee. Capture makes that ratification cheap, it does not remove it.

**Input contract.** Do not couple to any one tool's log format. Define a neutral schema and ship one adapter, so anyone can write their own:

```ts
interface CapturedSession {
  id: string;
  prompt: string;          // what was asked
  startingCode: string;    // becomes solution_stub.py
  finalCode: string;       // becomes the reference solution
  language: "python";
  outcome?: { accepted: boolean; note?: string };  // feeds L3
}
```

**What ships.**

- `npm run capture -- --session <file.json>` writes a `tasks/<id>/` scaffold: `task.json`, `solution_stub.py`, and `test_suite.draft.py` with a `NEEDS_REVIEW` header.
- Reuses the existing `gen-tests.ts` path to draft the candidate suite.
- Promotion is gated by the existing `scripts/sanity-tasks.mjs` check (the stub must fail, the reference must pass). A case that cannot satisfy that is not a valid eval case and is rejected with an explanation.
- Provenance recorded on every task:

```json
"provenance": {
  "source": "captured",
  "capturedAt": "2026-07-17",
  "reviewStatus": "human_reviewed",
  "sessionRef": "..."
}
```

**Dashboard.** A provenance badge on each task (authored vs captured) and a headline counter: "N of M tasks captured from real sessions." That number going up over time is the visible proof the loop is closed.

**Honest limits to document.** Capture drafts, humans ratify. Any case whose assertions were not human-reviewed is flagged `unreviewed` in the UI and excluded from headline pass rates, because an unratified case is a guess about intent, not a measurement of it.

---

## Build sequence

Ordered by value per unit of effort, so the live dashboard improves at each step rather than only at the end.

**Phase 1: Judge calibration.** Pure derivation from data v0.3 already produces. Touches `report.ts`, `types.ts`, dashboard types, and renames one tab. Smallest change, strongest narrative gain.

**Phase 2: Metric layers.** L2 derives from stored transcripts (no new input). L3 adds the sidecar plus the cross-layer matrix. Delivers `passedButRejected`, the release's headline metric.

**Phase 3: Session capture.** New command, new schema, new review flow, provenance in the dashboard. Most work, most novel, and it depends on nothing above, so it can slip without blocking a release.

**Phase 4: Demo, docs, deploy.** Regenerate demo data so all three capabilities are visible with no API key, update docs, ship to Pages.

Phases 1 and 2 are independently releasable. If time runs short, 0.4 can ship as 1 + 2 + 4, with capture as 0.5.

---

## Making sure users actually understand this

The features are worthless if a first-time visitor cannot tell what they are looking at. Comprehension work is part of the release, not a follow-up.

1. **The demo carries the story.** The bundled demo run must include at least one `passedButRejected` case, one `unsafe` calibration band, and two captured tasks. Anyone who opens the live dashboard with no API key should be able to see all three ideas working. This is the single highest-leverage doc.
2. **Every new number gets an in-UI explainer.** The dashboard already has a `SectionTitle` hint pattern. Use it on every new metric, in plain language, stating what the number means and what action it implies. A trust band that does not say what to do with it is decoration.
3. **README gets a "What's new in 0.4" section** that leads with the through-line table above, then one short section per capability written as problem then answer, not feature then description.
4. **EVAL_DESIGN.md gets the methodology**: calibration thresholds and why those cutoffs, the small-n caveat and the Wilson interval choice, the capture provenance contract and why human ratification is required, and the definition of each metric layer.
5. **Add CHANGELOG.md**, starting at 0.4 and back-filling 0.2 and 0.3 briefly.
6. **One diagram in the README**: the closed loop (session, capture, review, suite, run, outcome, back to session). One image explains capture faster than three paragraphs.

---

## Non-goals for 0.4

Named explicitly so scope stays honest:

- Not building repo-level or multi-file tasks (that stays Horizon 1).
- Not auto-promoting captured cases without human review.
- Not shipping a hosted service, auth, or multi-tenant storage. Local and file-based stays the model.
- Not claiming statistical significance from 15 tasks. The interval and the `insufficient_data` band exist to prevent exactly that.

## Definition of done

- `--tests both` produces a calibration report with per-category bands and intervals.
- Every task result carries L2 behavior stats; the cross-layer matrix renders when outcome data exists.
- `capture` turns a session file into a reviewable task scaffold that passes the sanity check before promotion.
- The public demo shows all three without an API key.
- README, EVAL_DESIGN, and CHANGELOG explain each capability as a problem before a feature.
- Typecheck and build clean, deployed to Pages.
