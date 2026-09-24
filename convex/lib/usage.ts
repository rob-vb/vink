// Tokens each outside model call uses, for the fixture eval harness
// (scripts/eval) to price. Nothing listens in the app.

export type Usage = { model: string; inputTokens: number; outputTokens: number };

export const usage = {
  listener: null as ((usage: Usage) => void) | null,
  record(entry: Usage) {
    usage.listener?.(entry);
  },
};
