# Agent OS (TypeScript)

Multi-agent LLM platform: Fastify gateway -> Kafka (Redpanda) -> DAG orchestrator -> agents.

## Run it

```bash
npm install
npm run infra:up            # Redpanda, Neo4j, Postgres
# in separate terminals:
npm run dev:gateway
npm run dev:orchestrator
npm run dev:retrieval
npm run dev:research
```

## Try it

```bash
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"username":"bob","password":"dev123"}' | jq -r .token)

# terminal A: watch events (npx wscat -c "ws://localhost:3000/ws?token=$TOKEN")
# terminal B: submit a task
curl -s localhost:3000/tasks -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"prompt":"How does Kafka handle parallel consumers?"}'
```

Viewer role (`carol`) gets 403 on POST /tasks. Redpanda Console: http://localhost:8080

## Flow
POST /tasks -> `tasks.submitted` -> orchestrator runs DAG (retrieve -> research) via
`agent.<name>.requests` / `agent.results` -> `task.events` -> gateway -> WebSocket.
