/**
 * Cost estimation for agent turns. omp reports token usage per turn but no
 * dollar figures, so we estimate from published per-1M-token prices keyed by
 * provider + model family. The table is a curated snapshot of list prices
 * (USD per 1M tokens, input / output) with a blended fallback for models we
 * do not recognize — estimates are indicative, never billing-accurate.
 */

// Order matters: the first entry whose regex matches the model ref wins.
const PRICING_TIERS = [
  { match: /anthropic\/claude.*(?:sonnet)/i, input: 3, output: 15 },
  { match: /anthropic\/claude.*(?:opus)/i, input: 15, output: 75 },
  { match: /anthropic\/claude.*(?:haiku)/i, input: 0.8, output: 4 },
  { match: /openai\/o[1-4](?:-mini)?|openai\/gpt-5/i, input: 1.25, output: 10 },
  { match: /openai\/gpt-4\.1/i, input: 2, output: 8 },
  { match: /openai\/gpt-4o/i, input: 2.5, output: 10 },
  { match: /openai\/gpt-4/i, input: 30, output: 60 },
  { match: /openai\/gpt-3\.5/i, input: 0.5, output: 1.5 },
  { match: /google\/gemini.*(?:flash|nano)/i, input: 0.3, output: 1.5 },
  { match: /google\/gemini/i, input: 1.25, output: 10 },
  { match: /deepseek/i, input: 0.27, output: 1.1 },
  { match: /meta\/llama/i, input: 0.25, output: 1 },
  { match: /mistral/i, input: 0.15, output: 0.6 },
  { match: /qwen/i, input: 0.2, output: 1.2 },
];

const FALLBACK_TIER = { input: 1, output: 3 };

const findTier = (modelRef) =>
  PRICING_TIERS.find((tier) => tier.match.test(modelRef || '')) || FALLBACK_TIER;

/**
 * Estimate the USD cost of a turn.
 * @param {string|null|undefined} modelRef - e.g. "anthropic/claude-sonnet-4"
 * @param {{ prompt?: number, completion?: number, total?: number }} tokens
 * @returns {{ input: number, output: number, total: number, inputPrice: number, outputPrice: number }}
 */
export function estimateCost(modelRef, { prompt = 0, completion = 0, total = 0 } = {}) {
  const tier = findTier(modelRef);
  if (prompt > 0 || completion > 0) {
    const input = (prompt / 1e6) * tier.input;
    const output = (completion / 1e6) * tier.output;
    return { input, output, total: input + output, inputPrice: tier.input, outputPrice: tier.output };
  }
  // No input/output breakdown (e.g. a cached turn): blend both rates.
  const blended = (tier.input + tier.output) / 2;
  const estimate = (total / 1e6) * blended;
  return { input: 0, output: estimate, total: estimate, inputPrice: tier.input, outputPrice: tier.output };
}

/** Compact USD rendering: "$0.00", "<$0.01" for tiny amounts. */
export function formatCost(usd) {
  const value = Number(usd) || 0;
  if (value <= 0) return '$0.00';
  if (value < 0.005) return '<$0.01';
  return `$${value.toFixed(2)}`;
}
