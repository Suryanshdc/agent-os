import { complete, recall, routeModel, type AgentRequest, type AgentResult } from "@aios/shared";

export type Handler = (req: AgentRequest) => Promise<Pick<AgentResult, "output" | "usage">>;

// Phase 1: in-memory docs. Phase 3 replaces this with Neo4j graph retrieval.
const DOCS = [
  "Kafka partitions topics so consumers in a group can process messages in parallel.",
  "Idempotent producers prevent duplicate writes when a send is retried.",
  "A DAG workflow runs independent steps in parallel and joins results at dependent steps.",
  "RBAC maps users to roles, and roles to permitted actions.",
];

const retrieval: Handler = async (req) => {
  const terms = req.input.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  const docHits = DOCS.filter((d) => terms.some((t) => d.toLowerCase().includes(t)));

  // Memory: this user's own earlier tasks about the same topics (from the Neo4j graph).
  const memories = req.userId ? await recall(req.userId, req.input) : [];
  const fromMemory = memories.map(
    (m) => `Earlier you asked "${m.prompt}" and the answer was: ${m.answer.slice(0, 200)}`,
  );

  const all = [...fromMemory, ...docHits];
  return { output: all.length ? all.join("\n") : "No relevant context found." };
};

// Pick the cheapest model that can handle the question (judged on the question only, not the context).
function pickModel(input: string) {
  return routeModel(input.split("\n\nContext:")[0] ?? input);
}

const research: Handler = async (req) => {
  const { tier, model } = pickModel(req.input);
  const { text, usage } = await complete(
    req.input,
    "You are a research agent. Answer concisely using the provided context when relevant.",
    { model },
  );
  return { output: text, usage: { ...usage, tier } };
};

const codegen: Handler = async (req) => {
  const { tier, model } = pickModel(req.input);
  const { text, usage } = await complete(
    req.input,
    "You are a code generation agent. Reply with working code in one fenced block, then a short explanation.",
    { model },
  );
  return { output: text, usage: { ...usage, tier } };
};

export const HANDLERS: Record<string, Handler> = { retrieval, research, codegen };
