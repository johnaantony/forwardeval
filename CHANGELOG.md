# Changelog

## 0.4.0 - Closing the loop

The release theme: find where the metric says green when the truth is red, then let reality correct the suite. Design doc: [PLAN_v0.4.md](PLAN_v0.4.md).

- **Judge calibration.** The human-vs-LLM suite comparison now rolls up into per-category trust scores: agreement rate, Wilson 95% interval, and a band (`autonomous` / `supervised` / `unsafe` / `insufficient_data`). The Test authorship tab is now the Judge calibration tab: the trust table is the answer, the per-task comparison below it is the evidence. Run comparison surfaces agreement drift between runs.
- **Metric layers.** L2 behavior stats derived from the existing transcripts (tool calls, rework loops after the first test run, first-try pass rate) and an L3 human-outcome sidecar (`outcomes.json`, recorded via `node scripts/outcome.mjs`). The Overview shows the three layers and the headline cross-layer cell: **passed but rejected**.
- **Session capture.** `npm run capture -- --session <file.json>` turns a real coding session into a candidate task: scaffold, drafted assertions, and a mandatory human-ratification gate before promotion (review the draft, rename to `test_suite.py`, mark `human_reviewed`, pass the sanity check). Task provenance (`authored` vs `captured`) is recorded and badged in the dashboard. Two captured tasks ship in the suite: `slugify-url-handles` and `retry-with-backoff` (17 tasks total).
- Demo runs now exercise all of the above with real test execution: 17 compared suites, an `unsafe` calibration band on `edge_cases`, and one passed-but-rejected outcome.

## 0.3.0 - Claude 5 family

- Support for `claude-fable-5` and `claude-sonnet-5`, with correct list pricing (and a fix to the Opus 4.8 price). Sampling parameters are omitted automatically on models that reject them (Claude 5 family, Opus 4.7+).
- Default model is now `claude-sonnet-5`.

## 0.2.0 - Test authorship

- `--tests human|llm|both`: an LLM can author the deterministic suite from the prompt and stub alone, never seeing the expert suite; both suites score the same solution and every task is labeled `agree_pass` / `agree_fail` / `llm_missed` / `llm_stricter`. The headline metric is `llm_missed`: the LLM suite passes code the expert catches.

## 0.1.0 - Initial release

- Agentic loop with tool use, sandboxed execution, deterministic hidden-suite verdicts, failure-mode classifier (analysis only, never the grader), token ROI, and the four-lens dashboard.
