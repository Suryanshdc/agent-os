import { randomUUID } from "node:crypto";
import type { Producer } from "kafkajs";
import {
  TOPICS,
  createKafka,
  createProducer,
  ensureTopics,
  publish,
  subscribe,
  TaskSubmittedSchema,
  type AgentRequest,
  type AgentResult,
  type TaskEvent,
  type TaskEventType,
  type TaskSubmitted,
} from "@aios/shared";
import { DEFAULT_WORKFLOW, layers } from "./dag.js";

const MAX_STEPS = 10; // guard against runaway workflows
const STEP_TIMEOUT_MS = 30_000;

const kafka = createKafka("orchestrator");
await ensureTopics(kafka, [TOPICS.tasksSubmitted, TOPICS.taskEvents, TOPICS.agentResults, TOPICS.deadLetter]);
const producer: Producer = await createProducer(kafka);

type Pending = { resolve: (r: AgentResult) => void; timer: NodeJS.Timeout };
const pending = new Map<string, Pending>();

// Per-instance group: results must reach the instance that is awaiting them.
// (In production, key pending state in Redis/Postgres so any replica can resume.)
await subscribe<AgentResult>({
  kafka,
  producer,
  topic: TOPICS.agentResults,
  groupId: `orchestrator-results-${randomUUID()}`,
  handler: async (result) => {
    const key = `${result.taskId}:${result.stepId}`;
    const p = pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(key);
    p.resolve(result);
  },
});

function emit(task: TaskSubmitted, type: TaskEventType, payload?: unknown) {
  const event: TaskEvent = { taskId: task.taskId, userId: task.userId, type, payload, ts: new Date().toISOString() };
  return publish(producer, TOPICS.taskEvents, task.taskId, event);
}

function callAgent(req: AgentRequest): Promise<AgentResult> {
  return new Promise(async (resolve) => {
    const key = `${req.taskId}:${req.stepId}`;
    const timer = setTimeout(() => {
      pending.delete(key);
      resolve({ taskId: req.taskId, stepId: req.stepId, agent: req.agent, error: "timeout" });
    }, STEP_TIMEOUT_MS);
    pending.set(key, { resolve, timer });
    await publish(producer, TOPICS.agentRequests(req.agent), req.taskId, req);
  });
}

async function runTask(task: TaskSubmitted) {
  await emit(task, "task.started");
  const results: Record<string, string> = {};
  let steps = 0;
  let totalCost = 0;

  try {
    for (const layer of layers(DEFAULT_WORKFLOW)) {
      steps += layer.length;
      if (steps > MAX_STEPS) throw new Error("max steps exceeded");

      const layerResults = await Promise.all(
        layer.map(async (node) => {
          await emit(task, "step.started", { step: node.id, agent: node.agent });
          const res = await callAgent({
            taskId: task.taskId,
            stepId: node.id,
            agent: node.agent,
            input: node.buildInput(task.prompt, results),
            context: results,
          });
          return { node, res };
        }),
      );

      for (const { node, res } of layerResults) {
        if (res.error) {
          await emit(task, "step.failed", { step: node.id, error: res.error });
          throw new Error(`step ${node.id} failed: ${res.error}`);
        }
        results[node.id] = res.output ?? "";
        totalCost += res.usage?.costUsd ?? 0;
        await emit(task, "step.completed", { step: node.id, usage: res.usage });
      }
    }
    const finalStep = DEFAULT_WORKFLOW[DEFAULT_WORKFLOW.length - 1]!.id;
    await emit(task, "task.completed", { answer: results[finalStep], totalCostUsd: totalCost });
  } catch (err) {
    await emit(task, "task.failed", { error: String(err) });
  }
}

await subscribe<TaskSubmitted>({
  kafka,
  producer,
  topic: TOPICS.tasksSubmitted,
  groupId: "orchestrator-tasks",
  handler: async (raw) => {
    const task = TaskSubmittedSchema.parse(raw);
    void runTask(task); // don't block the consumer loop while a task runs
  },
});

console.log("orchestrator running");
