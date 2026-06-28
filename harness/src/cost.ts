import type { Pricing, TokenUsage } from "./types.js";

/**
 * Two cost views, by design:
 *   - "Tokens": raw input/output counts straight from the API. Always available,
 *     needs no configuration. This is the physical meter.
 *   - "Cost": Tokens x price-per-token. Optional. Returns null when no pricing
 *     is configured, in which case the dashboard shows Tokens only.
 */

export function emptyTokens(): TokenUsage {
  return { input: 0, output: 0, total: 0 };
}

export function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

/** USD cost for a token usage, or null when pricing is disabled/unknown. */
export function costFor(
  tokens: TokenUsage,
  pricing: Pricing | null,
): number | null {
  if (!pricing) return null;
  const cost =
    (tokens.input / 1_000_000) * pricing.inputPerMTok +
    (tokens.output / 1_000_000) * pricing.outputPerMTok;
  // round to 6 dp - these are fractions of a cent at this scale
  return Math.round(cost * 1e6) / 1e6;
}
