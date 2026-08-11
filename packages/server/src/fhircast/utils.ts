// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CurrentContext, FhircastAnchorResourceType } from '@medplum/core';
import { OperationOutcomeError, badRequest, generateId, serverError } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { createHash } from 'node:crypto';
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
  const topicCurrentContextKey = getTopicCurrentContextKey(projectId, topic);
  await getCacheRedis().set(topicCurrentContextKey, JSON.stringify(currentContext));
}

/**
 * Replaces a topic's current context, but only if it is still at the version the caller read it at.
 *
 * Redis runs a script to completion before serving another command, so the version is compared and
 * the context replaced without another update landing in between.
 * Source: https://redis.io/docs/latest/develop/programmability/eval-intro/
 *
 * `KEYS[1]` is the context key, `ARGV[1]` the version the caller expects to still be stored, and
 * `ARGV[2]` the serialized context to store. Returns 1 when the context was replaced, 0 when it was
 * missing or had already moved on.
 */
const COMPARE_AND_SET_CURRENT_CONTEXT = `
local stored = redis.call('GET', KEYS[1])
if not stored then
  return 0
end
local ok, context = pcall(cjson.decode, stored)
if not ok or context['context.versionId'] ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

/**
 * Redis keys its script cache by the SHA-1 of the script body, so the digest the cache is addressed
 * by can be derived here instead of being learned from a `SCRIPT LOAD` round trip at startup.
 */
const COMPARE_AND_SET_CURRENT_CONTEXT_SHA = createHash('sha1').update(COMPARE_AND_SET_CURRENT_CONTEXT).digest('hex');

/**
 * Replaces a topic's current context, unless it has changed since the caller read it.
 *
 * Applying a context update is a read-modify-write: the Hub reads the current context, applies the
 * subscriber's update bundle to it, and stores the result under a new version. Two updates racing on
 * one topic would both pass the version check they are each validated against, and the write that
 * landed second would drop the other's changes while announcing a `context.priorVersionId` that was
 * never the version it was actually applied to. Making the write conditional keeps the version chain
 * honest: whichever update loses the race is rejected and its subscriber can retry against the
 * context that won.
 * @param projectId - The project the topic belongs to.
 * @param topic - The topic whose current context is being replaced.
 * @param expectedVersionId - The `context.versionId` the caller read and applied its update to.
 * @param currentContext - The context to store, carrying its new `context.versionId`.
 * @returns `true` if the context was replaced, `false` if it had already moved on.
 */
export async function compareAndSetTopicCurrentContext<
  ResourceType extends FhircastAnchorResourceType = FhircastAnchorResourceType,
>(
  projectId: string,
  topic: string,
  expectedVersionId: string,
  currentContext: CurrentContext<ResourceType>
): Promise<boolean> {
  const key = getTopicCurrentContextKey(projectId, topic);
  const serializedContext = JSON.stringify(currentContext);
  let replaced: unknown;
  try {
    replaced = await getCacheRedis().evalsha(
      COMPARE_AND_SET_CURRENT_CONTEXT_SHA,
      1,
      key,
      expectedVersionId,
      serializedContext
    );
  } catch (err: unknown) {
    // A `NOSCRIPT` reply means the cache no longer holds the script, which a flush, a restart, or a
    // failover to a replica can each leave behind. `EVAL` runs the script and caches it under the
    // same digest, putting later calls back on `EVALSHA`.
    if (!(err instanceof Error && err.message.includes('NOSCRIPT'))) {
      throw err;
    }
    replaced = await getCacheRedis().eval(
      COMPARE_AND_SET_CURRENT_CONTEXT,
      1,
      key,
      expectedVersionId,
      serializedContext
    );
  }
  return replaced === 1;
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
