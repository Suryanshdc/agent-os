import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyWebsocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  TOPICS,
  createKafka,
  createProducer,
  ensureTopics,
  publish,
  subscribe,
  type TaskEvent,
  type TaskSubmitted,
} from "@aios/shared";
import { DEV_USERS, authenticate, requireRole } from "./auth.js";

const app = Fastify({ logger: true });
await app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? "dev-secret" });
await app.register(fastifyWebsocket);

const kafka = createKafka("gateway");
await ensureTopics(kafka, [
  TOPICS.tasksSubmitted,
  TOPICS.taskEvents,
  TOPICS.agentResults,
  TOPICS.agentRequests("research"),
  TOPICS.agentRequests("retrieval"),
  TOPICS.deadLetter,
]);
const producer = await createProducer(kafka);

// userId -> open sockets
const sockets = new Map<string, Set<WebSocket>>();
const adminSockets = new Set<WebSocket>();

// Unique group per instance so every gateway replica sees every event.
await subscribe<TaskEvent>({
  kafka,
  producer,
  topic: TOPICS.taskEvents,
  groupId: `gateway-events-${randomUUID()}`,
  handler: async (event) => {
    const payload = JSON.stringify(event);
    for (const ws of sockets.get(event.userId) ?? []) ws.send(payload);
    for (const ws of adminSockets) ws.send(payload);
  },
});

app.get("/health", async () => ({ ok: true }));

app.post("/auth/login", async (req, reply) => {
  const body = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "invalid body" });
  const user = DEV_USERS[body.data.username];
  if (!user || user.password !== body.data.password) {
    return reply.code(401).send({ error: "bad credentials" });
  }
  const token = app.jwt.sign({ sub: body.data.username, role: user.role }, { expiresIn: "1h" });
  return { token, role: user.role };
});

app.post(
  "/tasks",
  { preHandler: [authenticate, requireRole("admin", "developer")] },
  async (req, reply) => {
    const body = z.object({ prompt: z.string().min(1).max(4000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid body" });

    const task: TaskSubmitted = {
      taskId: randomUUID(),
      userId: req.user.sub,
      prompt: body.data.prompt,
      submittedAt: new Date().toISOString(),
    };
    await publish(producer, TOPICS.tasksSubmitted, task.taskId, task);
    return reply.code(202).send({ taskId: task.taskId });
  },
);

// WebSocket: browsers can't set headers, so the JWT comes in the query string.
app.get("/ws", { websocket: true }, (socket, req) => {
  const token = new URL(req.url, "http://x").searchParams.get("token") ?? "";
  let user: { sub: string; role: string };
  try {
    user = app.jwt.verify(token);
  } catch {
    socket.close(4401, "unauthorized");
    return;
  }

  const set = user.role === "admin" ? adminSockets : (sockets.get(user.sub) ?? new Set());
  set.add(socket);
  if (user.role !== "admin") sockets.set(user.sub, set);
  socket.send(JSON.stringify({ type: "connected", user: user.sub }));

  socket.on("close", () => set.delete(socket));
});

await app.listen({ port: Number(process.env.GATEWAY_PORT ?? 3000), host: "0.0.0.0" });
