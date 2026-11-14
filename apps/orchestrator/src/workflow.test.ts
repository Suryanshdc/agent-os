import { buildWorkflow } from "./workflow.js";

let researchCalls = 0;
const events: string[] = [];
const graph = buildWorkflow(
  async (agent, stepId, input) => {
    if (agent === "research" && ++researchCalls < 2) return { taskId: "t", stepId, agent, error: "boom" };
    return { taskId: "t", stepId, agent, output: `${agent}:${input.slice(0, 15)}`, usage: { model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.5, latencyMs: 1 } };
  },
  async (type, p) => { events.push(`${type}:${JSON.stringify(p)}`); },
);
const out = await graph.invoke({ prompt: "hello" }, { recursionLimit: 10 });
console.log(out);
console.log(events.join("\n"));
