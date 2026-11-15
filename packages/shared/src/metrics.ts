import http from "node:http";
import client from "prom-client";

/** One shared registry per process. Prometheus scrapes it from /metrics. */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const reg = [registry];
export const m = {
  tasksSubmitted: new client.Counter({ name: "aios_tasks_submitted_total", help: "Tasks accepted by the gateway", registers: reg }),
  tasksTotal: new client.Counter({ name: "aios_tasks_total", help: "Tasks finished", labelNames: ["status"], registers: reg }),
  taskDuration: new client.Histogram({
    name: "aios_task_duration_seconds", help: "End-to-end task time", buckets: [0.25, 0.5, 1, 2, 5, 10, 30, 60], registers: reg,
  }),
  stepDuration: new client.Histogram({
    name: "aios_agent_step_duration_seconds", help: "Time an agent spends on one step", labelNames: ["agent"],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30], registers: reg,
  }),
  stepsTotal: new client.Counter({ name: "aios_agent_steps_total", help: "Agent steps handled", labelNames: ["agent", "status"], registers: reg }),
  stepFailures: new client.Counter({ name: "aios_step_failures_total", help: "Failed step attempts (each is retried)", registers: reg }),
  llmCost: new client.Counter({ name: "aios_llm_cost_usd_total", help: "Estimated LLM cost", labelNames: ["agent", "tier"], registers: reg }),
  llmCostIfLarge: new client.Counter({
    name: "aios_llm_cost_if_large_usd_total", help: "What the same calls would cost on the large model", labelNames: ["agent"], registers: reg,
  }),
  routerTier: new client.Counter({ name: "aios_router_tier_total", help: "Router decisions by tier", labelNames: ["tier"], registers: reg }),
};

/** For programs that are not web servers (orchestrator, agents): serve /metrics on a small port. */
export function startMetricsServer(port: number): void {
  http
    .createServer(async (req, res) => {
      if (req.url === "/metrics") {
        res.setHeader("content-type", registry.contentType);
        res.end(await registry.metrics());
      } else {
        res.statusCode = 404;
        res.end();
      }
    })
    .listen(port, () => console.log(`metrics on :${port}/metrics`));
}
