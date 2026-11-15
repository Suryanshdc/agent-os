import neo4j, { type Driver } from "neo4j-driver";

/**
 * Memory graph:  (User)-[:ASKED]->(Task)-[:MENTIONS]->(Topic)
 * Two tasks are "related" when they mention the same topics.
 * If Neo4j is down, every function degrades gracefully so the rest of the system keeps working.
 */

let driver: Driver | undefined;
let schemaReady = false;

function getDriver(): Driver {
  driver ??= neo4j.driver(
    process.env.NEO4J_URI ?? "bolt://localhost:7687",
    neo4j.auth.basic(process.env.NEO4J_USER ?? "neo4j", process.env.NEO4J_PASSWORD ?? "devpassword"),
    { connectionAcquisitionTimeout: 3000 }, // fail fast instead of hanging if Neo4j is down
  );
  return driver;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const session = getDriver().session();
  try {
    await session.run("CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT task_id IF NOT EXISTS FOR (t:Task) REQUIRE t.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (p:Topic) REQUIRE p.name IS UNIQUE");
    schemaReady = true;
  } finally {
    await session.close();
  }
}

const STOPWORDS = new Set([
  "what", "when", "where", "which", "while", "with", "without", "about", "from", "that", "this", "these",
  "those", "there", "their", "them", "then", "than", "have", "does", "would", "could", "should", "write",
  "make", "explain", "describe", "give", "tell", "please", "question", "context", "earlier", "asked",
  "into", "your", "also", "some", "more", "most", "very", "just", "like", "work", "works", "using", "used",
]);

/** Pull out the meaningful words of a text. Simple on purpose; Phase 4 could use an LLM instead. */
export function extractTopics(text: string, max = 8): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? [];
  const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  return [...new Set(words.filter((w) => !STOPWORDS.has(w)).map(stem))].slice(0, max);
}

export async function saveTask(t: { userId: string; taskId: string; prompt: string; answer: string }): Promise<void> {
  const session = getDriver().session();
  try {
    await ensureSchema();
    await session.run(
      `MERGE (u:User {id: $userId})
       MERGE (t:Task {id: $taskId})
       SET t.prompt = $prompt, t.answer = $answer, t.ts = datetime()
       MERGE (u)-[:ASKED]->(t)
       WITH t
       UNWIND $topics AS name
       MERGE (p:Topic {name: name})
       MERGE (t)-[:MENTIONS]->(p)`,
      { ...t, topics: extractTopics(t.prompt) },
    );
  } catch (err) {
    console.warn("[memory] could not save task (is Neo4j running?):", String(err).slice(0, 120));
  } finally {
    await session.close();
  }
}

export interface Memory {
  prompt: string;
  answer: string;
  sharedTopics: number;
}

/** Find this user's earlier tasks that share topics with the new question. */
export async function recall(userId: string, question: string, limit = 3): Promise<Memory[]> {
  const topics = extractTopics(question);
  if (!topics.length) return [];
  const session = getDriver().session();
  try {
    await ensureSchema();
    const res = await session.run(
      `MATCH (u:User {id: $userId})-[:ASKED]->(t:Task)-[:MENTIONS]->(p:Topic)
       WHERE p.name IN $topics
       RETURN t.prompt AS prompt, t.answer AS answer, count(p) AS shared
       ORDER BY shared DESC, t.ts DESC
       LIMIT toInteger($limit)`,
      { userId, topics, limit },
    );
    return res.records.map((r) => ({
      prompt: String(r.get("prompt")),
      answer: String(r.get("answer")),
      sharedTopics: Number(r.get("shared")),
    }));
  } catch (err) {
    console.warn("[memory] could not recall (is Neo4j running?):", String(err).slice(0, 120));
    return [];
  } finally {
    await session.close();
  }
}
