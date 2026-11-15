export type Tier = "small" | "medium" | "large";

// EXAMPLE prices in $ per million tokens. Check anthropic.com/pricing and update these
// before you quote any savings number on your resume.
export const TIERS: Record<Tier, { model: string; inputPerMTok: number; outputPerMTok: number }> = {
  small: { model: process.env.MODEL_SMALL ?? "claude-haiku-5-5", inputPerMTok: 1, outputPerMTok: 5 },
  medium: { model: process.env.MODEL_MEDIUM ?? "claude-sonnet-5-5", inputPerMTok: 3, outputPerMTok: 15 },
  large: { model: process.env.MODEL_LARGE ?? "claude-opus-5-5", inputPerMTok: 5, outputPerMTok: 25 },
};

/**
 * Score how hard a question looks, then pick a tier.
 * Rule-based on purpose: free, instant, and easy to explain in an interview.
 */
export function classifyComplexity(prompt: string): Tier {
  const text = prompt.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  let score = 0;
  if (words > 40) score += 1;
  if (words > 120) score += 1;
  if (/\b(code|function|implement|script|regex|bug|refactor|snippet)\b/.test(text)) score += 1;
  // Hard-topic words. One is a strong hint; two or more means a genuinely hard question.
  const hard = new Set(text.match(/\b(architect\w*|design|trade-?offs?|compare|migrat\w*|distributed|scal\w*|security|concurren\w*|optimi[sz]\w*)\b/g)?.map((w) => w.slice(0, 5)));
  score += hard.size >= 2 ? 3 : hard.size === 1 ? 2 : 0;
  if (/\b(step[- ]by[- ]step|several|multiple|and then)\b/.test(text)) score += 1;
  return score >= 3 ? "large" : score >= 1 ? "medium" : "small";
}

export function routeModel(prompt: string): { tier: Tier; model: string } {
  const tier = classifyComplexity(prompt);
  return { tier, model: TIERS[tier].model };
}

export function priceFor(model: string) {
  return Object.values(TIERS).find((t) => t.model === model) ?? TIERS.small;
}

export function estimateCost(tier: Tier, inputTokens: number, outputTokens: number): number {
  const t = TIERS[tier];
  return (inputTokens * t.inputPerMTok + outputTokens * t.outputPerMTok) / 1_000_000;
}
