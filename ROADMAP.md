# ROADMAP

Two horizons. Horizon 1 scales the *correctness* eval toward the industry gold standard. Horizon 2, **Layer 2**, is the differentiated bet: extend the eval from "is the code correct?" to "is the shipped code *valuable to customers*?"

---

## Horizon 1: Scale toward real SWE-bench

ForwardEval today is a faithful *miniature* of [SWE-bench](https://www.swebench.com/): real tests as the verdict, fix-without-regression, an agentic loop. The path to repo-level realism:

1. **Repo-level tasks (Mode B).** Point the harness at a real Git repo and a real test command (`pytest`, `npm test`, `go test`) instead of a single-file stub. The loop is unchanged; only `entry_file` and `test_command` widen to a working tree. This also makes ForwardEval a **dogfooding gate for your own AI-assisted coding projects**, answering "did the AI's change pass, and did anything regress?"
2. **FAIL_TO_PASS / PASS_TO_PASS semantics.** Adopt SWE-bench's exact contract: the issue's failing tests must flip to pass, *and* the previously passing tests must stay passing. ForwardEval already encodes the regression idea; this formalizes it.
3. **Contamination control.** Rotate and refresh tasks, and record task provenance, so a model cannot have memorized the answer (the LiveCodeBench lesson).
4. **Containerized sandbox.** Move from best-effort `sandbox-exec` and `unshare` to per-task containers for untrusted repos at scale.
5. **Statistical rigor.** Confidence intervals on pass rate, multiple seeds, and pass@k as standard, so small deltas are trustworthy.

**Why stop at 15 tasks for v1:** rigor and reproducibility come first. A deterministic, auditable 15-task harness you can read end to end beats a flaky 500-task one you cannot trust.

---

## Horizon 2, Layer 2: from code-correct to customer-valuable

**The gap nobody closes.** Every coding eval, SWE-bench included, stops at "does the code work?" None answer "does the working code make customers successful?" That second question is a *product-outcome* question: adoption, completion rate, the right events firing in production. Tests cannot answer it; instrumentation can.

### The idea

When the agent builds or changes a feature, ForwardEval does not only verify correctness; it **emits a recommended instrumentation plan**: the product events to track and the success thresholds that would prove the feature is valuable. The eval becomes a **product-outcome design partner**, not just a code grader.

### Concrete example

> **Task:** "Add a guest-checkout flow to the cart service."
>
> **Layer 1 output (today):** tests pass, so the code is correct.
>
> **Layer 2 output (the vision):**
> - **Instrument:** `guest_checkout_started`, `address_entered`, `payment_method_selected`, `purchase_completed`, `guest_checkout_abandoned`.
> - **Success metric:** guest-checkout completion rate at or above 60%; abandonment at payment below 25%.
> - **Guardrail:** no increase in the overall checkout error rate.
> - **Why these events:** they trace the funnel this code enables, so adoption is measurable within days of shipping rather than guessed.

### Why this is the differentiated bet

- It connects **code correctness** to **business outcome**, an under-served seam between eval tooling and product analytics.
- It is defensible because it requires someone who has done **both** rigorous eval **and** product telemetry and outcome-based measurement at scale, which is a rare combination.
- It speaks to **buyers**, not just developers. "Is the agent's code correct?" is a developer-tools question; "is the feature we shipped driving adoption?" is an executive question with budget attached.
- It is a natural fit for **Forward Deployed Engineers**, whose job is proving the thing they deployed creates measurable customer value.

### Why it's roadmap, not v1

Layer 2 needs a real running app, a telemetry SDK, and live users to be more than a suggestion engine; it is a separate product with a longer build. As an articulated vision with a concrete example, it costs almost nothing and signals two moves ahead. Build Layer 1 (shipped, deterministic, demoable); pitch Layer 2.

---

## Near-term backlog (small, high-leverage)

- Forced self-review turn before "done" (see FINDINGS idea #1).
- Capability-Gap auto-report: cluster failure tags into ranked, evidence-backed weaknesses.
- CI mode: non-zero exit and a Markdown diff comment when pass rate drops or any task flips from pass to fail.
- pass@k surfaced in the dashboard; confidence intervals on the headline.
