// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CurrentContext,
  FhircastAnchorResourceType,
  OperationOutcomeError,
  badRequest,
  generateId,
  serverError,
} from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { getRedis } from '../redis';

const RESOURCE_TYPE_LOWER_TO_VALID_RESOURCE_TYPE = {
  patient: 'Patient',
  imagingstudy: 'ImagingStudy',
  encounter: 'Encounter',
  diagnosticreport: 'DiagnosticReport',
} as Record<string, FhircastAnchorResourceType>;

export function getTopicCurrentContextKey(projectId: string, topic: string): string {
  return `medplum:fhircast:project:${projectId}:topic:${topic}:latest`;
}

export function getTopicContextStorageKey(projectId: string, topic: string): string {
  return `medplum:fhircast:project:${projectId}:topic:${topic}:contexts`;
}

export function extractAnchorResourceType(eventName: string): FhircastAnchorResourceType {
  const loweredResourceType = eventName.split('-')[0].toLowerCase();
  const extractedResourceType = RESOURCE_TYPE_LOWER_TO_VALID_RESOURCE_TYPE[loweredResourceType];
  if (!extractedResourceType) {
    throw new OperationOutcomeError(badRequest('Invalid anchor resource type'));
  }
  return extractedResourceType;
}

export async function getCurrentContext<ResourceType extends FhircastAnchorResourceType = FhircastAnchorResourceType>(
  projectId: string,
  topic: string
): Promise<CurrentContext<ResourceType> | undefined> {
  const topicCurrentContextKey = getTopicCurrentContextKey(projectId, topic);
  const currentContextStr = await getRedis().get(topicCurrentContextKey);
  if (!currentContextStr) {
    return undefined;
  }
  return JSON.parse(currentContextStr);
}

export async function setTopicCurrentContext<
  ResourceType extends FhircastAnchorResourceType = FhircastAnchorResourceType,
>(projectId: string, topic: string, currentContext: CurrentContext<ResourceType>): Promise<void> {
  const topicCurrentContextKey = `medplum:fhircast:project:${projectId}:topic:${topic}:latest`;
  await getRedis().set(topicCurrentContextKey, JSON.stringify(currentContext));
}

export async function cleanupContextForResource(
  projectId: string,
  topic: string,
  anchorResource: Resource
): Promise<void> {
  const topicContextsStorageKey = getTopicContextStorageKey(projectId, topic);
  await getRedis().hdel(topicContextsStorageKey, anchorResource.id as string);
}

export async function cleanupAllContextsForTopic(projectId: string, topic: string): Promise<void> {
  const topicContextsStorageKey = getTopicContextStorageKey(projectId, topic);
  await getRedis().del(topicContextsStorageKey);
}

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
