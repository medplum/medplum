// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { FhircastMessagePayload } from '@medplum/core';
import { generateId } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { publish } from '../pubsub';
import { getLogger } from '../logger';
import { getSubscribersForEvent } from './subscriptions';
import { RedisKeys } from './types';
import type { SubscriberRecord, SyncErrorContext } from './types';

/**
 * Publish a FHIRcast event to all subscribers of a topic that are subscribed to this event type.
 *
 * Unlike the old hub's fire-and-forget approach, this function:
 * 1. Filters subscribers by their event subscriptions
 * 2. Publishes to the Redis channel (which the WebSocket handler forwards to filtered subscribers)
 * 3. Returns the list of subscribers who should receive the event (for ack tracking)
 */
export async function publishEvent(
  projectId: string,
  payload: FhircastMessagePayload
): Promise<SubscriberRecord[]> {
  const topic = payload.event['hub.topic'];
  const eventName = payload.event['hub.event'];
  const channel = RedisKeys.topicChannel(projectId, topic);

  // Get subscribers filtered by event
  const subscribers = await getSubscribersForEvent(projectId, topic, eventName);

  if (subscribers.length === 0) {
    getLogger().debug('[FHIRcast R4] No subscribers for event', { projectId, topic, eventName });
    return [];
  }

  // Publish to Redis channel
  // The WebSocket handler will filter per-subscriber based on their event list
  const message = JSON.stringify({
    ...payload,
    _meta: {
      eventName,
      projectId,
      topic,
    },
  });

  await publish(channel, message);

  getLogger().info('[FHIRcast R4] Event published', {
    projectId,
    topic,
    eventName,
    eventId: payload.id,
    subscriberCount: subscribers.length,
  });

  return subscribers;
}

/**
 * Publish a SyncError event to subscribers that are subscribed to 'syncerror'.
 *
 * Per spec: "SyncError events distributed only to Subscribers which have subscribed to them"
 */
export async function publishSyncError(
  projectId: string,
  topic: string,
  operationOutcome: OperationOutcome,
  triggeringEventName?: string
): Promise<void> {
  const syncErrorPayload: FhircastMessagePayload = {
    timestamp: new Date().toISOString(),
    id: generateId(),
    event: {
      'hub.topic': topic,
      'hub.event': 'syncerror',
      context: [
        {
          key: 'operationoutcome',
          resource: operationOutcome,
        } as SyncErrorContext,
      ],
    },
  };

  const channel = RedisKeys.topicChannel(projectId, topic);
  const message = JSON.stringify({
    ...syncErrorPayload,
    _meta: {
      eventName: 'syncerror',
      projectId,
      topic,
    },
  });

  await publish(channel, message);

  getLogger().warn('[FHIRcast R4] SyncError published', {
    projectId,
    topic,
    triggeringEventName,
    outcomeText: operationOutcome.issue?.[0]?.diagnostics,
  });
}

/**
 * Create a SyncError OperationOutcome for a subscriber timeout.
 */
export function createTimeoutSyncError(
  subscriberName: string | undefined,
  eventId: string,
  eventName: string
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'warning',
        code: 'timeout',
        diagnostics: `Subscriber${subscriberName ? ` '${subscriberName}'` : ''} did not respond to event '${eventName}' (id: ${eventId}) within timeout period`,
      },
    ],
  };
}

/**
 * Create a SyncError OperationOutcome for a subscriber refusal (4xx/5xx response).
 */
export function createRefusalSyncError(
  subscriberName: string | undefined,
  eventId: string,
  eventName: string,
  status: string
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'warning',
        code: 'processing',
        diagnostics: `Subscriber${subscriberName ? ` '${subscriberName}'` : ''} refused event '${eventName}' (id: ${eventId}) with status ${status}`,
      },
    ],
  };
}

/**
 * Create a SyncError OperationOutcome for an abnormal WebSocket close.
 */
export function createDisconnectSyncError(
  subscriberName: string | undefined,
  closeCode: number
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'warning',
        code: 'transient',
        diagnostics: `Subscriber${subscriberName ? ` '${subscriberName}'` : ''} disconnected abnormally (WebSocket close code: ${closeCode})`,
      },
    ],
  };
}

/**
 * Publish a heartbeat event to a topic.
 */
export async function publishHeartbeat(
  projectId: string,
  topic: string,
  periodSeconds: number
): Promise<void> {
  // Heartbeat is not in FhircastEventName but is defined in the spec.
  // Use a plain object to avoid the type constraint.
  const heartbeatPayload = {
    timestamp: new Date().toISOString(),
    id: generateId(),
    event: {
      'hub.topic': topic,
      'hub.event': 'heartbeat',
      context: [{ key: 'period', decimal: `${periodSeconds}` }],
    },
  };

  const channel = RedisKeys.topicChannel(projectId, topic);
  const message = JSON.stringify({
    ...heartbeatPayload,
    _meta: {
      eventName: 'heartbeat',
      projectId,
      topic,
    },
  });

  await publish(channel, message).catch((err: Error) => {
    getLogger().error('[FHIRcast R4] Failed to publish heartbeat', {
      projectId,
      topic,
      error: err.message,
    });
  });
}
