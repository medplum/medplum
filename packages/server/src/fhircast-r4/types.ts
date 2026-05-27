// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { FhircastEventName, FhircastMessagePayload } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';

/**
 * Per-subscriber state stored in Redis and tracked in-memory by WebSocket connections.
 */
export interface SubscriberRecord {
  /** The unique WebSocket endpoint ID for this subscriber. */
  readonly endpoint: string;
  /** The topic this subscriber is subscribed to. */
  readonly topic: string;
  /** The project ID for this subscriber. */
  readonly projectId: string;
  /** Comma-separated list of events this subscriber is subscribed to. */
  readonly events: string;
  /** Optional human-readable subscriber name (sent in SyncError notifications). */
  readonly subscriberName?: string;
  /** Lease duration in seconds. */
  readonly leaseSeconds: number;
  /** Timestamp (ms) when the subscription was created. */
  readonly subscribedAt: number;
}

/**
 * WebSocket subscription confirmation message.
 * Sent by hub to subscriber after WebSocket connection is established.
 * See: https://build.fhir.org/ig/HL7/fhircast-docs/2-4-Subscribing.html
 */
export interface SubscriptionConfirmation {
  'hub.mode': 'subscribe';
  'hub.topic': string;
  'hub.events': string;
  'hub.lease_seconds': number;
}

/**
 * WebSocket subscription denial message.
 * Sent by hub when subscription is denied or unsubscribed.
 */
export interface SubscriptionDenial {
  'hub.mode': 'denied';
  'hub.topic': string;
  'hub.events': string;
  'hub.reason'?: string;
}

/**
 * Subscriber acknowledgment response sent over WebSocket.
 * See: https://build.fhir.org/ig/HL7/fhircast-docs/2-5-ReceiveEventNotification.html
 */
export interface SubscriberResponse {
  /** Event ID from the notification. */
  id: string;
  /** Numeric HTTP status code as string (e.g. "200", "409"). */
  status: string;
}

/**
 * Pending acknowledgment tracker for a single event notification.
 */
export interface PendingAck {
  /** The event ID we're waiting for acknowledgment of. */
  readonly eventId: string;
  /** The endpoint of the subscriber we're waiting on. */
  readonly endpoint: string;
  /** Timer handle for the 10-second timeout. */
  readonly timer: ReturnType<typeof setTimeout>;
  /** Resolve function for the pending promise. */
  readonly resolve: (response: SubscriberResponse) => void;
}

/**
 * Event handler entry in the dispatch table.
 */
export type EventCategory = 'open' | 'close' | 'update' | 'select' | 'other';

/**
 * Maps event names to their categories for dispatch.
 */
export function getEventCategory(eventName: string): EventCategory {
  const lower = eventName.toLowerCase();
  if (lower.endsWith('-open')) {
    return 'open';
  }
  if (lower.endsWith('-close')) {
    return 'close';
  }
  if (lower.endsWith('-update')) {
    return 'update';
  }
  if (lower.endsWith('-select')) {
    return 'select';
  }
  return 'other';
}

/**
 * Check whether a subscriber's event filter includes a given event.
 * Per spec: "Hubs and Subscribers SHALL be case insensitive for event-names"
 */
export function subscriberWantsEvent(subscriberEvents: string, eventName: string): boolean {
  const normalizedEvent = eventName.toLowerCase();
  const subscribedEvents = subscriberEvents.split(',').map((e) => e.trim().toLowerCase());
  return subscribedEvents.includes(normalizedEvent);
}

/**
 * SyncError event context with OperationOutcome.
 */
export interface SyncErrorContext {
  key: 'operationoutcome';
  resource: OperationOutcome;
}

/**
 * Configuration for the FHIRcast R4 hub.
 */
export interface FhircastR4Config {
  /** Ack timeout in milliseconds (default: 10000). */
  ackTimeoutMs: number;
  /** WebSocket ping interval in milliseconds (default: 30000). */
  pingIntervalMs: number;
  /** Maximum missed pongs before closing connection (default: 3). */
  maxMissedPongs: number;
  /** Default lease seconds for subscriptions (default: 3600). */
  defaultLeaseSeconds: number;
}

export const DEFAULT_CONFIG: FhircastR4Config = {
  ackTimeoutMs: 10_000,
  pingIntervalMs: 30_000,
  maxMissedPongs: 3,
  defaultLeaseSeconds: 3600,
};

/**
 * The set of events supported by this hub.
 */
export const SUPPORTED_EVENTS: readonly string[] = [
  'syncerror',
  'heartbeat',
  'userlogout',
  'userhibernate',
  'Patient-open',
  'Patient-close',
  'ImagingStudy-open',
  'ImagingStudy-close',
  'Encounter-open',
  'Encounter-close',
  'DiagnosticReport-open',
  'DiagnosticReport-close',
  'DiagnosticReport-select',
  'DiagnosticReport-update',
];

/**
 * Type guard for FhircastMessagePayload.
 */
export function isFhircastMessagePayload(obj: unknown): obj is FhircastMessagePayload {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const payload = obj as Record<string, unknown>;
  return (
    typeof payload.timestamp === 'string' &&
    typeof payload.id === 'string' &&
    typeof payload.event === 'object' &&
    payload.event !== null &&
    typeof (payload.event as Record<string, unknown>)['hub.topic'] === 'string' &&
    typeof (payload.event as Record<string, unknown>)['hub.event'] === 'string'
  );
}

/**
 * Type guard for SubscriberResponse.
 */
export function isSubscriberResponse(obj: unknown): obj is SubscriberResponse {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const resp = obj as Record<string, unknown>;
  return typeof resp.id === 'string' && typeof resp.status === 'string';
}

/**
 * Redis key helpers for the R4 hub. Uses `fhircast-r4` prefix to avoid collisions
 * with the existing `fhircast` prefix used by STU2/STU3.
 */
export const RedisKeys = {
  /** Hash storing all subscriber records for a topic. Field = endpoint, Value = JSON SubscriberRecord. */
  topicSubscribers(projectId: string, topic: string): string {
    return `medplum:fhircast-r4:project:${projectId}:topic:${topic}:subs`;
  },
  /** Maps endpoint ID to "projectId:topic". */
  endpointMapping(endpoint: string): string {
    return `medplum:fhircast-r4:endpoint:${endpoint}:topic`;
  },
  /** Current context for a topic. */
  topicCurrentContext(projectId: string, topic: string): string {
    return `medplum:fhircast-r4:project:${projectId}:topic:${topic}:latest`;
  },
  /** Hash storing archived contexts for a topic (DiagnosticReport multi-context). */
  topicContextStorage(projectId: string, topic: string): string {
    return `medplum:fhircast-r4:project:${projectId}:topic:${topic}:contexts`;
  },
  /** Redis pub/sub channel for a topic. */
  topicChannel(projectId: string, topic: string): string {
    return `fhircast-r4:${projectId}:${topic}`;
  },
  /** Endpoint key for topic endpoint generation (atomic setnx). */
  topicEndpoint(projectId: string, topic: string): string {
    return `medplum:fhircast-r4:project:${projectId}:topic:${topic}:endpoint`;
  },
} as const;

/**
 * Parse a "projectId:topic" string from Redis.
 */
export function parseProjectAndTopic(value: string): { projectId: string; topic: string } | undefined {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) {
    return undefined;
  }
  return {
    projectId: value.substring(0, colonIndex),
    topic: value.substring(colonIndex + 1),
  };
}
