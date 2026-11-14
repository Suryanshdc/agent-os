import {
  TOPICS,
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
    try {
      const out = await handler(req);
      result = { taskId: req.taskId, stepId: req.stepId, agent: name, ...out };
    } catch (err) {
      result = { taskId: req.taskId, stepId: req.stepId, agent: name, error: String(err) };
    }
    await publish(producer, TOPICS.agentResults, req.taskId, result);
  },
});

console.log(`agent "${name}" running`);
