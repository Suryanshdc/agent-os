import { complete, type AgentRequest, type AgentResult } from "@aios/shared";

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
  const hits = DOCS.filter((d) => terms.some((t) => d.toLowerCase().includes(t)));
  return { output: hits.length ? hits.join("\n") : "No relevant context found." };
};

const research: Handler = async (req) => {
  const { text, usage } = await complete(
    req.input,
    "You are a research agent. Answer concisely using the provided context when relevant.",
  );
  return { output: text, usage };
};

const codegen: Handler = async (req) => {
  const { text, usage } = await complete(
    req.input,
    "You are a code generation agent. Reply with working code in one fenced block, then a short explanation.",
  );
  return { output: text, usage };
};

export const HANDLERS: Record<string, Handler> = { retrieval, research, codegen };
