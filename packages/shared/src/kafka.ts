import { Kafka, logLevel, type Producer } from "kafkajs";

export function createKafka(clientId: string): Kafka {
  const brokers = (process.env.KAFKA_BROKERS ?? "localhost:19092").split(",");
  return new Kafka({ clientId, brokers, logLevel: logLevel.WARN });
}

export async function ensureTopics(kafka: Kafka, topics: string[]): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({
    topics: topics.map((topic) => ({ topic, numPartitions: 3 })),
  });
  await admin.disconnect();
}

export async function createProducer(kafka: Kafka): Promise<Producer> {
  const producer = kafka.producer({ idempotent: true });
  await producer.connect();
  return producer;
}

export async function publish<T>(
  producer: Producer,
  topic: string,
  key: string,
  value: T,
): Promise<void> {
  await producer.send({ topic, messages: [{ key, value: JSON.stringify(value) }] });
}

/**
 * Subscribe to a topic and invoke `handler` per message.
 * Failures are sent to the dead-letter topic instead of crashing the consumer.
 */
export async function subscribe<T>(opts: {
  kafka: Kafka;
  groupId: string;
  topic: string;
  producer: Producer;
  handler: (msg: T) => Promise<void>;
}): Promise<void> {
  const consumer = opts.kafka.consumer({ groupId: opts.groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: opts.topic, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message, topic }) => {
      const raw = message.value?.toString() ?? "";
      try {
        await opts.handler(JSON.parse(raw) as T);
      } catch (err) {
        console.error(`[${opts.groupId}] handler failed on ${topic}`, err);
        await publish(opts.producer, "dead.letter", message.key?.toString() ?? "none", {
          topic,
          raw,
          error: String(err),
        });
      }
    },
  });
}
