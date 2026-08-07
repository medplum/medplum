// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CurrentContext, FhircastAnchorResourceType } from '@medplum/core';
import { OperationOutcomeError, badRequest, generateId, serverError } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { globalLogger } from '../logger';
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

export const FhircastVersion = {
  STU2: 'STU2',
  STU3: 'STU3',
} as const;
export type FhircastVersion = (typeof FhircastVersion)[keyof typeof FhircastVersion];

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
 * What is published to a topic's Redis pub/sub channel.
 *
 * Every subscriber on a topic reads the one channel, so a message meant for a single subscriber
 * names it in `target` and is dropped by the rest. Only `payload` reaches the wire, so the
 * addressing never discloses one subscriber's endpoint to another.
 */
export type FhircastChannelMessage = {
  /** The message to deliver to the subscriber, verbatim. */
  payload: Record<string, any>;
  /** The endpoint of the sole subscriber this message is for; absent to reach the whole topic. */
  target?: string;
};

/**
 * Serializes a message for a topic's Redis pub/sub channel.
 * @param payload - The message to deliver to subscribers.
 * @param target - The endpoint of the one subscriber to deliver it to, if it is not for the topic.
 * @returns The serialized channel message.
 */
export function serializeFhircastChannelMessage(payload: Record<string, any>, target?: string): string {
  return JSON.stringify({ payload, target } satisfies FhircastChannelMessage);
}

export async function setEndpointSubscription(endpoint: string, subscription: FhircastSubscription): Promise<void> {
  await getCacheRedis().set(
    getEndpointSubscriptionKey(endpoint),
    JSON.stringify(subscription),
    'EX',
    FHIRCAST_LEASE_SECONDS
  );
}

function isFhircastSubscription(subscription: unknown): subscription is FhircastSubscription {
  const candidate = subscription as FhircastSubscription | null;
  return (
    typeof candidate?.projectId === 'string' &&
    typeof candidate.topic === 'string' &&
    Array.isArray(candidate.events) &&
    candidate.events.every((event) => typeof event === 'string') &&
    Object.values(FhircastVersion).includes(candidate.version)
  );
}

export async function getEndpointSubscription(endpoint: string): Promise<FhircastSubscription | undefined> {
  const subscriptionStr = await getCacheRedis().get(getEndpointSubscriptionKey(endpoint));
  if (!subscriptionStr) {
    return undefined;
  }
  let subscription: unknown;
  try {
    subscription = JSON.parse(subscriptionStr);
  } catch (_err) {
    subscription = undefined;
  }
  // Schema drift reads as no subscription, which callers already handle by denying the endpoint,
  // rather than flowing downstream as a malformed object.
  if (!isFhircastSubscription(subscription)) {
    globalLogger.error('[FHIRcast]: Discarding a malformed subscription read from the cache', { endpoint });
    return undefined;
  }
  return subscription;
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
 * previously handed to the subscriber. Subscribers echo the whole URL back when unsubscribing, and
 * are free to have appended a query string or fragment, neither of which names the endpoint.
 * @param endpointUrl - The endpoint URL, or a bare endpoint.
 * @returns The endpoint, or `undefined` if the URL has no path segments.
 */
export function extractEndpoint(endpointUrl: unknown): string | undefined {
  if (typeof endpointUrl !== 'string') {
    return undefined;
  }
  return endpointUrl.split(/[?#]/)[0].split('/').findLast(Boolean);
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
  // The topic expires with the lease granted to subscriptions against it, see FHIRCAST_LEASE_SECONDS

  const results = await getCacheRedis()
    .multi()
    .set(topicKey, newTopic, 'NX')
    .get(topicKey)
    .expire(topicKey, FHIRCAST_LEASE_SECONDS)
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
