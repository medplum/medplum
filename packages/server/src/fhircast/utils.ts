import { OperationOutcomeError, generateId, serverError } from '@medplum/core';
import { getRedis } from '../redis';

export async function getTopicForUser(userId: string): Promise<string> {
  const newTopic = generateId();
  const topicKey = `medplum:fhircast:topic:${userId}`;

  // Sets the topic key to the new topic if it doesn't exist, then gets either existing or the new topic
  // 3600 seconds is the configured expiry time for the associated token, so this should work
  // Per the spec, the lease time of a subscription should not exceed the token expiry time
  // Source: https://fhircast.org/specification/STU2/#session-discovery:~:text=.%20If%20using%20OAuth%202.0%2C%20the%20Hub%20SHALL%20limit%20the%20subscription%20lease%20seconds%20to%20be%20less%20than%20or%20equal%20to%20the%20access%20token%27s%20expiration.

  const results = await getRedis().multi().set(topicKey, newTopic, 'EX', 3600, 'NX').get(topicKey).exec();
  if (!results) {
    throw new OperationOutcomeError(serverError(new Error(`Failed to get value for ${topicKey} from Redis`)));
  }
  const [error, result] = results?.[1] as [error: Error, result: string];
  if (error) {
    throw new OperationOutcomeError(serverError(error));
  }
  return result;
}
