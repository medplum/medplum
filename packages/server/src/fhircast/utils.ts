import { generateId } from '@medplum/core';
import { getRedis } from '../redis';

export async function getTopicForUser(userId: string): Promise<string> {
  const newTopic = generateId();
  const topicKey = `::fhircast::topic:${userId}`;

  // Sets the topic key to the new topic if it doesn't exist, then gets either existing or the new topic
  // 3600 seconds is the configured expiry time for the associated token, so this should work
  // Per the spec, the lease time of a subscription should not exceed the token expiry time
  // Source: https://fhircast.org/specification/STU2/#session-discovery:~:text=.%20If%20using%20OAuth%202.0%2C%20the%20Hub%20SHALL%20limit%20the%20subscription%20lease%20seconds%20to%20be%20less%20than%20or%20equal%20to%20the%20access%20token%27s%20expiration.
  const topic = await getRedis().set(topicKey, newTopic, 'EX', 3600, 'NX', 'GET');
  // If topic is null, it means there was no value at the given key, so we should return the new topic
  return topic || newTopic;
}
