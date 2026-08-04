// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CurrentContext, FhircastAnchorResourceType } from '@medplum/core';
import { OperationOutcomeError, badRequest, generateId, serverError } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { getCacheRedis } from '../redis';

const RESOURCE_TYPE_LOWER_TO_VALID_RESOURCE_TYPE = {
  patient: 'Patient',
  imagingstudy: 'ImagingStudy',
  encounter: 'Encounter',
  diagnosticreport: 'DiagnosticReport',
} as Record<string, FhircastAnchorResourceType>;

/**
 * The lease granted to a subscription, in seconds.
 *
 * Matches the access token expiry, since the spec requires the lease to be no longer than it.
 * Source: https://fhircast.org/specification/STU3/#session-discovery
 */
export const FHIRCAST_LEASE_SECONDS = 3600;

export type FhircastVersion = 'STU2' | 'STU3';

/**
 * What the Hub remembers about a single subscriber, keyed by the endpoint it was issued.
 *
 * The version records which hub the subscription came in on, since it decides the shape of the
 * confirmation the subscriber is sent when it connects.
 */
export type FhircastSubscription = {
  projectId: string;
  topic: string;
  events: string[];
  version: FhircastVersion;
};

export function getEndpointSubscriptionKey(endpoint: string): string {
  return `medplum:fhircast:endpoint:${endpoint}:subscription`;
}

/**
 * Names the subscriber a Hub message is meant for, when it is not meant for the whole topic.
 *
 * Everything a topic publishes goes to one channel, so a message aimed at a single subscriber
 * carries its endpoint and is dropped by every other socket. The Hub strips this key before
 * forwarding, keeping the endpoint off the wire of the subscribers it is not addressed to.
 */
export const TARGET_ENDPOINT_KEY = '_targetEndpoint';

export async function setEndpointSubscription(endpoint: string, subscription: FhircastSubscription): Promise<void> {
  await getCacheRedis().set(
    getEndpointSubscriptionKey(endpoint),
    JSON.stringify(subscription),
    'EX',
    FHIRCAST_LEASE_SECONDS
  );
}

export async function getEndpointSubscription(endpoint: string): Promise<FhircastSubscription | undefined> {
  const subscriptionStr = await getCacheRedis().get(getEndpointSubscriptionKey(endpoint));
  if (!subscriptionStr) {
    return undefined;
  }
  return JSON.parse(subscriptionStr);
}

export async function deleteEndpointSubscription(endpoint: string): Promise<void> {
  await getCacheRedis().del(getEndpointSubscriptionKey(endpoint));
}

/**
 * Parses the `hub.events` field of a subscription request.
 *
 * The spec calls for a comma-separated list. Whitespace around the names is tolerated because
 * form-encoded requests commonly carry it, but it never separates two events.
 * Source: https://fhircast.org/specification/STU3/#subscribing-and-unsubscribing
 * @param events - The raw `hub.events` value.
 * @returns The event names, in the order requested.
 */
export function parseFhircastEvents(events: unknown): string[] {
  if (typeof events !== 'string') {
    return [];
  }
  return events
    .split(',')
    .map((event) => event.trim())
    .filter(Boolean);
}

/**
 * Extracts the endpoint a subscription was issued under from the `hub.channel.endpoint` URL
 * previously handed to the subscriber. Subscribers echo the whole URL back when unsubscribing.
 * @param endpointUrl - The endpoint URL, or a bare endpoint.
 * @returns The endpoint, or `undefined` if the URL has no path segments.
 */
export function extractEndpoint(endpointUrl: unknown): string | undefined {
  if (typeof endpointUrl !== 'string') {
    return undefined;
  }
  return endpointUrl.split('/').findLast(Boolean);
}

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
  const currentContextStr = await getCacheRedis().get(topicCurrentContextKey);
  if (!currentContextStr) {
    return undefined;
  }
  return JSON.parse(currentContextStr);
}

export async function setTopicCurrentContext<
  ResourceType extends FhircastAnchorResourceType = FhircastAnchorResourceType,
>(projectId: string, topic: string, currentContext: CurrentContext<ResourceType>): Promise<void> {
  const topicCurrentContextKey = `medplum:fhircast:project:${projectId}:topic:${topic}:latest`;
  await getCacheRedis().set(topicCurrentContextKey, JSON.stringify(currentContext));
}

export async function cleanupContextForResource(
  projectId: string,
  topic: string,
  anchorResource: Resource
): Promise<void> {
  const topicContextsStorageKey = getTopicContextStorageKey(projectId, topic);
  await getCacheRedis().hdel(topicContextsStorageKey, anchorResource.id as string);
}

export async function cleanupAllContextsForTopic(projectId: string, topic: string): Promise<void> {
  const topicContextsStorageKey = getTopicContextStorageKey(projectId, topic);
  await getCacheRedis().del(topicContextsStorageKey);
}

export async function getTopicForUser(userId: string): Promise<string> {
  const newTopic = generateId();
  const topicKey = `medplum:fhircast:topic:${userId}`;

  // Sets the topic key to the new topic if it doesn't exist, then gets either existing or the new topic
  // 3600 seconds is the configured expiry time for the associated token, so this should work
  // Per the spec, the lease time of a subscription should not exceed the token expiry time
  // Source: https://fhircast.org/specification/STU2/#session-discovery:~:text=.%20If%20using%20OAuth%202.0%2C%20the%20Hub%20SHALL%20limit%20the%20subscription%20lease%20seconds%20to%20be%20less%20than%20or%20equal%20to%20the%20access%20token%27s%20expiration.

  const results = await getCacheRedis()
    .multi()
    .set(topicKey, newTopic, 'NX')
    .get(topicKey)
    .expire(topicKey, 3600)
    .exec();

  if (!results) {
    throw new OperationOutcomeError(serverError(new Error(`Failed to get value for ${topicKey} from Redis`)));
  }
  const [error, result] = results?.[1] as [error: Error, result: string];
  if (error) {
    throw new OperationOutcomeError(serverError(error));
  }
  return result;
}
