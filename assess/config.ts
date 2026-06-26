// Assessor config. Model id / limits are configurable, never hardcoded magic.
export const assessConfig = {
  model: process.env.ASSESS_MODEL ?? "claude-opus-4-8",
  maxTokens: Number(process.env.ASSESS_MAX_TOKENS ?? 16000),
  maxKeyframes: Number(process.env.ASSESS_MAX_KEYFRAMES ?? 6),
};
