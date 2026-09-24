# ForwardEval v0.5 - "Say it once, then prove it against something hard"

**Status:** in progress (branch `feature/v0.5`)
**Previous release:** 0.4.0, see [PLAN_v0.4.md](PLAN_v0.4.md) and [CHANGELOG.md](CHANGELOG.md)

> Written before the work started, and kept as written. When 0.5 ships, an outcome section goes at the top recording where this plan was wrong, the same way PLAN_v0.4.md does.

---

## Why this release exists

Three problems, each with evidence behind it.

**1. A first-time visitor cannot tell what this measures.** The README opens with eight audiences and a four-row metric-layer table before a reader sees a single result, and the dashboard drops people straight into KPI tiles with no statement of what the run found or what to do about it. The thesis - real tests decide pass/fail, an LLM never does - is the third thing you read instead of the first. A tool whose entire argument is about honest measurement has to be legible in a minute, unaccompanied.

**2. The instrument is saturated.** One real run exists: 17/17 pass@1 on `claude-sonnet-5`. A suite everything passes cannot rank anything, and two of the three runs on the live dashboard are seeded demo data. The default Run Comparison pairs a seeded 76% against a real 100%, which reads as a 24-point improvement nobody measured.

**3. It only measures before release.** Every question worth asking about an agent in production - did the change get kept, how often does it claim done without checking, what did an accepted change cost - is outside the harness today. `capture.ts` accepts a hand-written JSON file and nothing else; there is no importer for any real agent log format.

## The through-line

v0.4 asked: **where does the metric say green when the truth is red?**

v0.5 asks the question one step earlier: **can a stranger tell what this measures, and does the measurement still discriminate?** A finding nobody can restate is not a finding, and a benchmark everything passes is not an instrument.

---

## Change 1: the product explains itself in 60 seconds

**Problem.** The thesis only lands when someone explains it in person. The artifact has to carry it alone.

**What ships.**

- One sentence, used verbatim in the README subtitle, the dashboard header, and the page meta description:
  > ForwardEval tells you whether a coding agent's change is ready to ship: real tests decide pass or fail, an LLM never does, and every result is priced.
- README: forward-deployed engineers lead the "Who it's for" section (they are who this was built for), followed by two adjacent audiences rather than eight. A **What one real run found** section goes above "What's new in 0.4", because a result is a better opening argument than an architecture.
- A **guided first run** in the dashboard: a visitor who has never seen an eval harness should learn, in order, what the verdict is, how it was reached, and what to do next - without reading the README first.
- Dashboard: a **Start here** panel at the top of Overview carrying the same three findings, each linking to the tab that proves it. Findings are derived from the loaded run, not hard-coded, so they stay true when the numbers change.
- Hash routing (`#overview`, `#tasks`, `#authorship`, `#compare`) so a link can open on the finding it is about.
- Demo runs are separated from real ones: real by default, demo behind a toggle, and a demo run is never silently compared against a real one. Demo data is kept (the dashboard must render with no API key), it just stops being the default story.

**Honest limit.** This is positioning work. It changes what a visitor understands, not what the harness measures.

## Change 2: make the suite discriminate again

**Problem.** At 17/17 the suite cannot separate two frontier models, and it cannot answer the question every team actually asks: which model is worth the money.

**What ships.**

- **Repo-level task mode**, adopting SWE-bench's contract: `fail_to_pass` tests must flip to passing and `pass_to_pass` tests must stay passing. New optional fields on `TaskSpec` (`fail_to_pass`, `pass_to_pass`, per-task `max_turns`); a `list_files` tool for the agent; the harness collects every changed non-hidden file instead of only `entry_file`; `verify.ts` records which specific tests broke. Single-file tasks keep working unchanged.
- **8 to 10 hard multi-file tasks** built to fail today: cross-file state, specs that only resolve by reading the existing code, refactors that must keep `pass_to_pass` green. The lesson from the first run is that difficulty lives in under-specification and integration, not in algorithm names, so the target is a Sonnet 5 pass rate between 40% and 80%, and any task every model passes is replaced.
- **Multi-model runs** (Haiku 4.5, Sonnet 5, Opus 5, Fable 5.1 if budget allows) at pass@3, with `claude-opus-5` and `claude-fable-5-1` added to the pricing table and the sampling-parameter exclusion list. List prices get checked against anthropic.com/pricing rather than assumed.
- **Generated suites are cached** as artifacts keyed by task and generator model (`results/llm-suites/<task>/<model>.py`). Authoring the LLM suites was 59% of the first run's spend and it does not depend on the model being evaluated.
- Pass-rate-versus-cost per model in Token ROI; the flip-list across models in Run Comparison; FINDINGS.md rewritten from the new data.

**Honest limit.** Ten multi-file Python tasks are still not SWE-bench. They are a harder miniature, and the README says so.

## Change 3: evaluate real sessions, not only benchmark tasks

**Problem.** The suite grades work that was invented for grading. The interesting failures happen in sessions someone actually ran.

**What ships.**

- `npm run ingest -- --format claude-code|otel --path <file-or-dir>`, with two adapters onto the existing tool-neutral session contract: Claude Code session logs (real data available immediately) and OpenTelemetry GenAI spans (the format LangSmith, Langfuse, Datadog and LiveKit already emit).
- The three layers, applied to ingested sessions: L1 deterministic checks (did tests run, were they green at the end, was anything edited after the last green run - "claimed done without checking"), L2 from the existing `deriveBehavior()`, L3 from the existing outcomes sidecar, inferred from commit-or-revert where a git repo is available.
- A **Production** tab: sessions ranked by how badly they went, each with a reason, reusing the transcript viewer.
- A promote path from a bad session into the existing capture flow, keeping its human-ratification gate. This is v0.4's loop, fed by reality instead of by a hand-written JSON file.
- Privacy: ingested sessions stay local, paths and secrets are redacted by default, nothing ingested is committed, and the public demo uses a scrubbed or synthetic session that is labeled as such.

**Honest limit.** L3 inferred from commits is a proxy. A commit is not acceptance, and the UI says which outcomes were inferred and which a human recorded.

---

## Non-goals

- The Layer 2 vision (recommending what to instrument) stays a roadmap argument.
- No hosted service, auth, or multi-tenant storage. Local and file-based stays the model.
- No voice-specific evals.
- No further judge-calibration statistics until the task count supports them.
- CI gate and pass@k in the dashboard remain backlog, after these three.

## Build sequence

1. **Change 1** - positioning and dashboard framing. Independently releasable.
2. **Change 2** - repo-level mode, hard tasks, multi-model runs. Ships as 0.5.0 with change 1.
3. **Change 3** - session ingest and the Production tab. Ships as 0.6.

## Definition of done

- A first-time visitor can state the thesis and one finding after a minute on the dashboard.
- The dashboard defaults to real data, and never compares a demo run against a real one by accident.
- `sanity-tasks.mjs` passes for every task, including the `fail_to_pass` / `pass_to_pass` contract.
- At least three models have real runs, with visibly different pass rates and cost per solve.
- A second run reuses cached generated suites, spending zero authoring tokens.
- One real Claude Code session and one OpenTelemetry export both ingest, score across all three layers, and one of them promotes into a reviewable task.
- README, CHANGELOG, EVAL_DESIGN and FINDINGS updated; typecheck and build clean; deployed to Pages.
