import { z } from "zod";

export const TOPICS = {
  tasksSubmitted: "tasks.submitted",
  taskEvents: "task.events",
  agentResults: "agent.results",
  agentRequests: (agent: string) => `agent.${agent}.requests`,
  deadLetter: "dead.letter",
} as const;

export type Role = "admin" | "developer" | "viewer";

export const TaskSubmittedSchema = z.object({
  taskId: z.string(),
  userId: z.string(),
  prompt: z.string().min(1).max(4000),
  submittedAt: z.string(),
});
export type TaskSubmitted = z.infer<typeof TaskSubmittedSchema>;

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface AgentRequest {
  taskId: string;
  stepId: string;
  agent: string;
  input: string;
  context: Record<string, string>;
}

export interface AgentResult {
  taskId: string;
  stepId: string;
  agent: string;
  output?: string;
  error?: string;
  usage?: Usage;
}

export type TaskEventType =
  | "task.started"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "task.completed"
  | "task.failed";

export interface TaskEvent {
  taskId: string;
  userId: string;
  type: TaskEventType;
  payload?: unknown;
  ts: string;
}
