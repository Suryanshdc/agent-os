import type { Usage } from "./contracts.js";
import { priceFor } from "./router.js";

export interface LlmResult {
  text: string;
  usage: Usage;
}

export async function complete(
  prompt: string,
  system?: string,
  opts: { model?: string } = {},
): Promise<LlmResult> {
  const model = opts.model ?? process.env.LLM_MODEL ?? "claude-haiku-5-5";
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
        (input_tokens * priceFor(model).inputPerMTok + output_tokens * priceFor(model).outputPerMTok) / 1_000_000,
      latencyMs: Date.now() - started,
    },
  };
}
