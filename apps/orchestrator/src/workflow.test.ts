import { buildWorkflow, needsCode } from "./workflow.js";

const usage = { model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.5, latencyMs: 1 };

async function run(prompt: string) {
  const called: string[] = [];
  const graph = buildWorkflow(
    async (agent, stepId) => {
      called.push(agent);
      return { taskId: "t", stepId, agent, output: `${agent}-output`, usage };
    },
    async () => {},
  );
  const out = await graph.invoke({ prompt }, { recursionLimit: 10 });
  return { called, answer: out.answer };
}

const a = await run("Write a TypeScript function to reverse a string");
const b = await run("How does Kafka handle parallel consumers?");
console.log("code question  ->", a.called.join(" > "), "|", a.answer);
console.log("other question ->", b.called.join(" > "), "|", b.answer);
console.log("needsCode:", needsCode("write a regex"), needsCode("what is Kafka"));
if (a.called.join() !== "retrieval,codegen" || b.called.join() !== "retrieval,research") {
  throw new Error("routing test failed");
}
console.log("ROUTING TEST PASSED");
