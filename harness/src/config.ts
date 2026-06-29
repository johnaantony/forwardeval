import type { Pricing } from "./types.js";

export const HARNESS_VERSION = "0.2.0";

/**
 * Test authorship mode. "human" preserves the original behavior (expert suite is
 * the only verdict). "llm" and "both" additionally author an LLM suite and
 * record the human-vs-LLM comparison; see RunConfig.testMode.
 */
export const DEFAULT_TEST_MODE = "human" as const;

/**
 * Default Claude model for the agent. Overridable with --model so runs can
 * compare models side-by-side (Run Comparison view).
 */
export const DEFAULT_MODEL = "claude-sonnet-4-6";

export const DEFAULT_MAX_TURNS = 6;
export const DEFAULT_TEMPERATURE = 0; // deterministic-ish agent behavior
export const DEFAULT_ATTEMPTS = 1; // pass@1 by default
export const DEFAULT_SANDBOX_TIMEOUT_MS = 30_000;

/**
 * Token prices (USD per 1,000,000 tokens), used ONLY for the optional "Cost"
 * view. The "Tokens" view never needs these - it reports raw counts from the
 * API. Prices change over time; users can override per-run with
 *   --input-price <usd-per-mtok> --output-price <usd-per-mtok>
 * or disable Cost entirely with --no-pricing.
 *
 * These are published list prices as a convenience default. Verify current
 * pricing at https://www.anthropic.com/pricing before relying on the Cost view.
 */
export const DEFAULT_PRICING: Record<string, Pricing> = {
  "claude-sonnet-4-6": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "claude-opus-4-8": { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
};

/** Resolve pricing for a model id, falling back to Sonnet-class prices. */
export function pricingForModel(model: string): Pricing {
  return (
    DEFAULT_PRICING[model] ??
    // closest-match fallback by family keyword
    (model.includes("opus")
      ? DEFAULT_PRICING["claude-opus-4-8"]
      : model.includes("haiku")
        ? DEFAULT_PRICING["claude-haiku-4-5"]
        : DEFAULT_PRICING["claude-sonnet-4-6"])
  );
}
