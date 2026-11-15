import {
  TOPICS,
  estimateCost,
  m,
  startMetricsServer,
  createKafka,
  createProducer,
  ensureTopics,
  publish,
  subscribe,
  type AgentRequest,
  type AgentResult,
} from "@aios/shared";
import { HANDLERS } from "./handlers.js";

const name = process.env.AGENT_NAME;
const handler = name ? HANDLERS[name] : undefined;
if (!name || !handler) {
  console.error(`Set AGENT_NAME to one of: ${Object.keys(HANDLERS).join(", ")}`);
  process.exit(1);
}

const METRICS_PORTS: Record<string, number> = { retrieval: 9111, research: 9112, codegen: 9113 };
startMetricsServer(Number(process.env.METRICS_PORT ?? METRICS_PORTS[name] ?? 9110));

const kafka = createKafka(`agent-${name}`);
await ensureTopics(kafka, [TOPICS.agentRequests(name), TOPICS.agentResults, TOPICS.deadLetter]);
const producer = await createProducer(kafka);

await subscribe<AgentRequest>({
  kafka,
  producer,
  topic: TOPICS.agentRequests(name),
  groupId: `agent-${name}`, // scale by running more replicas in the same group
  handler: async (req) => {
    let result: AgentResult;
    const stop = m.stepDuration.startTimer({ agent: name });
    try {
      const out = await handler(req);
      result = { taskId: req.taskId, stepId: req.stepId, agent: name, ...out };
      m.stepsTotal.inc({ agent: name, status: "ok" });
      const u = out.usage;
      if (u) {
        m.llmCost.inc({ agent: name, tier: u.tier ?? "n/a" }, u.costUsd);
        m.llmCostIfLarge.inc({ agent: name }, estimateCost("large", u.inputTokens, u.outputTokens));
        if (u.tier) m.routerTier.inc({ tier: u.tier });
      }
    } catch (err) {
      result = { taskId: req.taskId, stepId: req.stepId, agent: name, error: String(err) };
      m.stepsTotal.inc({ agent: name, status: "error" });
    }
    stop();
    await publish(producer, TOPICS.agentResults, req.taskId, result);
  },
});

console.log(`agent "${name}" running`);
