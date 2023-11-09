import { generateId } from '@medplum/core';
import { getRedis } from '../redis';

export async function getTopicForUser(userId: string): Promise<string> {
  const newTopic = generateId();
  const topicKey = `::fhircast::topic:${userId}`;

  // Sets the topic key to the new topic if it doesn't exist, then gets either existing or the new topic
  // 3600 seconds is the configured expiry time for the associated token, so this should work
  // Per the spec, the lease time of a subscription should not exceed the topic expiry time
  const topic = await getRedis().set(topicKey, newTopic, 'EX', 3600, 'NX', 'GET');
  // If topic is null, it means there was no value at the given key, so we should return the new topic
  return topic || newTopic;
}
