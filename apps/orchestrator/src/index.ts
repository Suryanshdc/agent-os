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
import { buildWorkflow } from "./workflow.js";

const STEP_TIMEOUT_MS = 30_000;

const kafka = createKafka("orchestrator");
await ensureTopics(kafka, [TOPICS.tasksSubmitted, TOPICS.taskEvents, TOPICS.agentResults, TOPICS.deadLetter]);
const producer: Producer = await createProducer(kafka);

type Pending = { resolve: (r: AgentResult) => void; timer: NodeJS.Timeout };
const pending = new Map<string, Pending>();

// Per-instance group: results must reach the instance that is awaiting them.
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

function callAgentOverKafka(task: TaskSubmitted, agent: string, stepId: string, input: string): Promise<AgentResult> {
  return new Promise((resolve) => {
    // A unique id per attempt so a retry never mixes up with a late reply from the previous try.
    const attemptId = `${stepId}#${randomUUID().slice(0, 8)}`;
    const key = `${task.taskId}:${attemptId}`;
    const timer = setTimeout(() => {
      pending.delete(key);
      resolve({ taskId: task.taskId, stepId: attemptId, agent, error: "timeout" });
    }, STEP_TIMEOUT_MS);
    pending.set(key, { resolve, timer });
    const req: AgentRequest = { taskId: task.taskId, stepId: attemptId, agent, input, context: {} };
    void publish(producer, TOPICS.agentRequests(agent), task.taskId, req);
  });
}

async function runTask(task: TaskSubmitted) {
  await emit(task, "task.started");
  try {
    const graph = buildWorkflow(
      (agent, stepId, input) => callAgentOverKafka(task, agent, stepId, input),
      (type, payload) => emit(task, type, payload),
    );
    // recursionLimit is the loop guard: the graph stops if it runs too many steps.
    const out = await graph.invoke({ prompt: task.prompt }, { recursionLimit: 10 });
    await emit(task, "task.completed", { answer: out.answer, totalCostUsd: out.costUsd });
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
