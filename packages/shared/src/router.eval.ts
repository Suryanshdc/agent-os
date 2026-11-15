// Run with: npm run eval:router
// Checks (1) does the router pick the tier a human would, and (2) how much would it save
// compared with always using the large model. Costs here are ESTIMATES, not real bills.
import { TIERS, classifyComplexity, estimateCost, type Tier } from "./router.js";

const CASES: { q: string; expected: Tier }[] = [
  { q: "What is Kafka?", expected: "small" },
  { q: "Define idempotency.", expected: "small" },
  { q: "What does RBAC stand for?", expected: "small" },
  { q: "What port does Postgres use by default?", expected: "small" },
  { q: "Explain what a consumer group is.", expected: "small" },
  { q: "Who created TypeScript?", expected: "small" },
  { q: "What is a JWT?", expected: "small" },
  { q: "Summarize what a message queue does.", expected: "small" },
  { q: "What is the difference between a topic and a partition?", expected: "small" },
  { q: "Write a function to reverse a string.", expected: "medium" },
  { q: "Write a regex that matches email addresses.", expected: "medium" },
  { q: "Fix this bug: my loop skips the last item in the array.", expected: "medium" },
  { q: "Implement a debounce function in TypeScript.", expected: "medium" },
  { q: "Write a script that renames all files in a folder.", expected: "medium" },
  { q: "Refactor this snippet to use async/await instead of callbacks.", expected: "medium" },
  { q: "Implement a function that retries a promise three times.", expected: "medium" },
  { q: "Design a distributed rate limiter that scales across regions and discuss the trade-offs.", expected: "large" },
  { q: "Compare Kafka and RabbitMQ for an event-driven architecture and recommend one.", expected: "large" },
  { q: "Plan a migration of a monolith to microservices, step by step, covering security and scaling.", expected: "large" },
  { q: "Design a secure multi-tenant architecture and explain the trade-offs of each isolation approach.", expected: "large" },
  { q: "Optimize this distributed job queue to handle concurrency and failures, and explain several approaches.", expected: "large" },
  { q: "Architect a system for real-time analytics that scales to millions of events, with security considerations.", expected: "large" },
];

const TIERS_LIST: Tier[] = ["small", "medium", "large"];
const confusion: Record<string, number> = {};
let correct = 0;
let routedCost = 0;
let largeCost = 0;
const IN = 250; // assumed input tokens per call (question + context)
const OUT = 400; // assumed output tokens per call

for (const c of CASES) {
  const got = classifyComplexity(c.q);
  if (got === c.expected) correct++;
  else console.log(`MISMATCH: expected ${c.expected}, got ${got}: "${c.q}"`);
  confusion[`${c.expected}->${got}`] = (confusion[`${c.expected}->${got}`] ?? 0) + 1;
  routedCost += estimateCost(got, IN, OUT);
  largeCost += estimateCost("large", IN, OUT);
}

console.log(`\nAccuracy: ${correct}/${CASES.length} (${((100 * correct) / CASES.length).toFixed(0)}%)`);
console.log("Counts (expected->got):", confusion);
console.log("Models:", Object.fromEntries(TIERS_LIST.map((t) => [t, TIERS[t].model])));
console.log(`\nEstimated cost, always large: $${largeCost.toFixed(4)}`);
console.log(`Estimated cost, routed:       $${routedCost.toFixed(4)}`);
console.log(`Estimated savings:            ${(100 * (1 - routedCost / largeCost)).toFixed(0)}%`);
