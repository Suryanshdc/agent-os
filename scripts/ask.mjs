// Usage: npm run ask -- "your question"
// Logs in, opens the live event stream, submits the task, and prints events until it finishes.
const BASE = process.env.GATEWAY_URL ?? "http://localhost:3000";
const prompt = process.argv.slice(2).join(" ") || "How does Kafka handle parallel consumers?";

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "bob", password: "dev123" }),
});
if (!login.ok) {
  console.error("Login failed. Is the gateway running?", login.status);
  process.exit(1);
}
const { token } = await login.json();

const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws?token=${token}`);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error("Could not connect to the event stream"));
});

console.log(`Question: ${prompt}\n`);
const res = await fetch(`${BASE}/tasks`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ prompt }),
});
if (!res.ok) {
  console.error("Submit failed:", res.status, await res.text());
  process.exit(1);
}
const { taskId } = await res.json();

const timeout = setTimeout(() => {
  console.error("\nNo result after 120 seconds. Check the other terminals for errors.");
  process.exit(1);
}, 120_000);

ws.onmessage = (msg) => {
  const e = JSON.parse(msg.data);
  if (e.taskId !== taskId) return;
  const p = e.payload ?? {};
  if (e.type === "task.started") console.log("▶ task started");
  if (e.type === "step.started") console.log(`  … ${p.step} (agent: ${p.agent}, attempt ${p.attempt})`);
  if (e.type === "step.completed") console.log(`  ✓ ${p.step} done`);
  if (e.type === "step.failed") console.log(`  ✗ ${p.step} failed: ${p.error}`);
  if (e.type === "task.completed") {
    console.log(`\n✔ DONE (cost $${p.totalCostUsd})\n\n${p.answer}`);
    clearTimeout(timeout);
    process.exit(0);
  }
  if (e.type === "task.failed") {
    console.log(`\n✘ FAILED: ${p.error}`);
    clearTimeout(timeout);
    process.exit(1);
  }
};
