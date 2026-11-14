import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AgentResult } from "@aios/shared";

// The "state" is the shared notebook every step can read and write.
const State = Annotation.Root({
  prompt: Annotation<string>(),
  context: Annotation<string>(),
  answer: Annotation<string>(),
  costUsd: Annotation<number>({
    reducer: (current, update) => current + update, // costs add up across steps
    default: () => 0,
  }),
});

export type CallAgent = (agent: string, stepId: string, input: string) => Promise<AgentResult>;
export type Notify = (type: "step.started" | "step.completed" | "step.failed", payload: unknown) => Promise<void>;

const MAX_ATTEMPTS = 3;

/** Try an agent up to 3 times, waiting longer after each failure (1s, 2s). */
async function withRetry(
  callAgent: CallAgent,
  notify: Notify,
  agent: string,
  stepId: string,
  input: string,
): Promise<AgentResult> {
  let last: AgentResult | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await notify("step.started", { step: stepId, agent, attempt });
    last = await callAgent(agent, stepId, input);
    if (!last.error) {
      await notify("step.completed", { step: stepId, usage: last.usage });
      return last;
    }
    await notify("step.failed", { step: stepId, error: last.error, attempt });
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`step ${stepId} failed after ${MAX_ATTEMPTS} attempts: ${last?.error}`);
}

export function buildWorkflow(callAgent: CallAgent, notify: Notify) {
  return new StateGraph(State)
    .addNode("retrieve", async (s) => {
      const r = await withRetry(callAgent, notify, "retrieval", "retrieve", s.prompt);
      return { context: r.output ?? "", costUsd: r.usage?.costUsd ?? 0 };
    })
    .addNode("research", async (s) => {
      const input = `Question: ${s.prompt}\n\nContext:\n${s.context}`;
      const r = await withRetry(callAgent, notify, "research", "research", input);
      return { answer: r.output ?? "", costUsd: r.usage?.costUsd ?? 0 };
    })
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "research")
    .addEdge("research", END)
    .compile();
}
