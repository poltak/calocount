import type { EvalCall } from "./types.js";

// Dollars for each million tokens. A model that is not here needs a price
// before a run, because the cost limit depends on it.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function priceOf(
  model: string,
): { input: number; output: number } | null {
  const known = Object.keys(PRICES).find((name) => model.startsWith(name));
  return known ? (PRICES[known] ?? null) : null;
}

/** A replayed or a scripted call has no price, because nothing was sent. */
export function costOf(calls: EvalCall[]): number {
  return calls.reduce((sum, call) => {
    const price = priceOf(call.model);
    return price
      ? sum +
          ((call.inputTokens ?? 0) * price.input +
            (call.outputTokens ?? 0) * price.output) /
            1_000_000
      : sum;
  }, 0);
}
