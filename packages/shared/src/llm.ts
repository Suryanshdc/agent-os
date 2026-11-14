import type { Usage } from "./contracts.js";

// Rough $/million-token prices. Update these to current pricing for your model.
const PRICE_PER_MTOK = { input: 1, output: 5 };

export interface LlmResult {
  text: string;
  usage: Usage;
}

export async function complete(prompt: string, system?: string): Promise<LlmResult> {
  const model = process.env.LLM_MODEL ?? "claude-haiku-5-5";
  const started = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Mock mode: free and deterministic, ideal for dev and tests.
  if (!apiKey) {
    await new Promise((r) => setTimeout(r, 150));
    return {
      text: `[mock:${model}] ${prompt.slice(0, 200)}`,
      usage: { model: `mock:${model}`, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: Date.now() - started },
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = data.content.map((b) => (b.type === "text" ? b.text ?? "" : "")).join("");
  const { input_tokens, output_tokens } = data.usage;
  return {
    text,
    usage: {
      model,
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      costUsd:
        (input_tokens * PRICE_PER_MTOK.input + output_tokens * PRICE_PER_MTOK.output) / 1_000_000,
      latencyMs: Date.now() - started,
    },
  };
}
