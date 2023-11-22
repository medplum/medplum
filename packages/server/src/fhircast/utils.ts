import { generateId } from '@medplum/core';
import { getRedis } from '../redis';

export async function getTopicForUser(userId: string): Promise<string> {
  const newTopic = generateId();
  const topictopic = `::fhircast::topic:${userId}`;

  // Sets the topic topic to the new topic if it doesn't exist, then gets either existing or the new topic
  // 3600 seconds is the configured expiry time for the associated token, so this should work
  // Per the spec, the lease time of a subscription should not exceed the token expiry time
  // Source: https://fhircast.org/specification/STU2/#session-discovery:~:text=.%20If%20using%20OAuth%202.0%2C%20the%20Hub%20SHALL%20limit%20the%20subscription%20lease%20seconds%20to%20be%20less%20than%20or%20equal%20to%20the%20access%20token%27s%20expiration.
  const topic = await getRedis().set(topictopic, newTopic, 'EX', 3600, 'NX', 'GET');
  // If topic is null, it means there was no value at the given topic, so we should return the new topic
  return topic || newTopic;
}

/**
 * A utility class for keeping heartbeat timers in a single store so they can be easily cleaned up.
 */
export class HeartbeatStore {
  private readonly store: Map<string, NodeJS.Timeout>;
  constructor() {
    this.store = new Map<string, NodeJS.Timeout>();
  }

  /**
   * Stops and cleans up all the heartbeats contained in this store.
   */
  stopAll(): void {
    for (const timeout of this.store.values()) {
      clearTimeout(timeout);
    }
    this.store.clear();
  }

  /**
   * Stops and cleans up the heartbeat for the given topic.
   *
   * @param topic - The topic to stop the heartbeat for.
   * @returns A boolean indicating the success of the operation. Returns false if a heartbeat does not exist for the specified topic.
   */
  stop(topic: string): boolean {
    if (this.store.has(topic)) {
      const timeout = this.store.get(topic);
      clearTimeout(timeout);
      this.store.delete(topic);
      return true;
    }
    return false;
  }

  /**
   * Starts a heartbeat for a given topic, ensuring that the connections for all clients subscribed to the given topic WebSockets stay active.
   *
   * @param topic - The topic to create a heartbeat for.
   * @param intervalMs - The interval between heartbeats in milliseconds.
   * @returns A boolean indicating the status of the operation. Returns false if topic already has a heartbeat.
   */
  start(topic: string, intervalMs: number): boolean {
    if (this.store.has(topic)) {
      return false;
    }
    const callback = (): void => {
      const heartbeatPayload = {
        timestamp: new Date().toISOString(),
        id: generateId(),
        event: {
          context: [{ key: 'period', decimal: `${Math.ceil(intervalMs / 1000)}` }],
          'hub.topic': topic,
          'hub.event': 'heartbeat',
        },
      };
      getRedis().publish(topic, JSON.stringify(heartbeatPayload)).catch(console.error);
      this.store.set(topic, setTimeout(callback, intervalMs));
    };
    this.store.set(topic, setTimeout(callback, intervalMs));
    return true;
  }

  /**
   * Asks the `HeartbeatStore` if the given topic has a heartbeat.
   *
   * @param topic - The topic to check for.
   * @returns `true` if the topic has a heartbeat, otherwise returns `false`.
   */
  has(topic: string): boolean {
    return this.store.has(topic);
  }

  /**
   * @returns The size of the `HeartbeatStore`.
   */
  get size(): number {
    return this.store.size;
  }
}
