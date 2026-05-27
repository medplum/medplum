// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getLogger } from '../logger';
import { removeSubscriber } from './subscriptions';
import { publishSyncError, createTimeoutSyncError, createRefusalSyncError, createDisconnectSyncError } from './event-bus';
import type { SubscriberRecord, SubscriberResponse } from './types';
import { DEFAULT_CONFIG } from './types';

/**
 * Map of eventId -> Map<endpoint, PendingAckEntry>
 * Tracks which subscribers we're waiting on for acknowledgment.
 */
interface PendingAckEntry {
  subscriber: SubscriberRecord;
  timer: ReturnType<typeof setTimeout>;
  resolve: (response: SubscriberResponse | null) => void;
}

const pendingAcks = new Map<string, Map<string, PendingAckEntry>>();

/**
 * Registered callback to close a WebSocket for a given endpoint.
 * Set by the WebSocket layer via `registerCloseSocketCallback`.
 * This avoids the routes layer needing to import from the ws layer.
 */
let closeSocketCallback: ((endpoint: string) => void) | undefined;

/**
 * Register the callback used to close WebSocket connections for non-responsive subscribers.
 * Called once by the WebSocket handler during initialization.
 */
export function registerCloseSocketCallback(callback: (endpoint: string) => void): void {
  closeSocketCallback = callback;
}

/**
 * Register pending acknowledgments for an event.
 * Sets up 10-second timers per subscriber.
 *
 * Per spec:
 * - Subscriber does not respond within 10 seconds → SyncError
 * - Hub SHALL unsubscribe the non-responsive subscriber
 */
export function trackEventAcks(
  eventId: string,
  eventName: string,
  subscribers: SubscriberRecord[]
): void {
  if (subscribers.length === 0) {
    return;
  }

  const entryMap = new Map<string, PendingAckEntry>();
  pendingAcks.set(eventId, entryMap);

  for (const subscriber of subscribers) {
    let resolve: (response: SubscriberResponse | null) => void;
    const promise = new Promise<SubscriberResponse | null>((r) => {
      resolve = r;
    });

    const timer = setTimeout(async () => {
      // Timeout - subscriber didn't respond in time
      getLogger().warn('[FHIRcast R4] Subscriber ack timeout', {
        eventId,
        eventName,
        endpoint: subscriber.endpoint,
        subscriberName: subscriber.subscriberName,
      });

      // Remove from pending
      entryMap.delete(subscriber.endpoint);
      if (entryMap.size === 0) {
        pendingAcks.delete(eventId);
      }

      // Generate SyncError
      const outcome = createTimeoutSyncError(subscriber.subscriberName, eventId, eventName);
      await publishSyncError(subscriber.projectId, subscriber.topic, outcome, eventName);

      // Unsubscribe the non-responsive subscriber
      await removeSubscriber(subscriber.projectId, subscriber.topic, subscriber.endpoint);
      if (closeSocketCallback) {
        closeSocketCallback(subscriber.endpoint);
      }

      resolve!(null);
    }, DEFAULT_CONFIG.ackTimeoutMs);

    entryMap.set(subscriber.endpoint, {
      subscriber,
      timer,
      resolve: resolve!,
    });

    // Handle the response when it arrives
    promise.then(async (response) => {
      if (!response) {
        return; // Timeout already handled
      }

      const statusCode = parseInt(response.status, 10);

      // 2xx = success
      if (statusCode >= 200 && statusCode < 300) {
        getLogger().debug('[FHIRcast R4] Subscriber ack success', {
          eventId,
          endpoint: subscriber.endpoint,
          status: response.status,
        });
        return;
      }

      // 4xx or 5xx = refusal → SyncError
      getLogger().warn('[FHIRcast R4] Subscriber refused event', {
        eventId,
        eventName,
        endpoint: subscriber.endpoint,
        status: response.status,
      });

      const outcome = createRefusalSyncError(subscriber.subscriberName, eventId, eventName, response.status);
      await publishSyncError(subscriber.projectId, subscriber.topic, outcome, eventName);
    }).catch((err) => {
      getLogger().error('[FHIRcast R4] Error processing subscriber response', { error: String(err) });
    });
  }
}

/**
 * Process a subscriber's response to an event notification.
 * Called by the WebSocket handler when it receives a { id, status } message.
 */
export function handleSubscriberResponse(endpoint: string, response: SubscriberResponse): boolean {
  const entryMap = pendingAcks.get(response.id);
  if (!entryMap) {
    return false; // No pending ack for this event ID
  }

  const entry = entryMap.get(endpoint);
  if (!entry) {
    return false; // No pending ack for this endpoint
  }

  // Clear the timeout
  clearTimeout(entry.timer);

  // Remove from pending
  entryMap.delete(endpoint);
  if (entryMap.size === 0) {
    pendingAcks.delete(response.id);
  }

  // Resolve the promise
  entry.resolve(response);
  return true;
}

/**
 * Handle an abnormal WebSocket close for a subscriber.
 * Per spec: Generate SyncError when close code is not 1000 (normal) or 1001 (going away).
 */
export async function handleAbnormalClose(
  subscriber: SubscriberRecord,
  closeCode: number
): Promise<void> {
  // Don't generate SyncError for normal closes
  if (closeCode === 1000 || closeCode === 1001) {
    return;
  }

  getLogger().warn('[FHIRcast R4] Abnormal WebSocket close', {
    endpoint: subscriber.endpoint,
    closeCode,
    subscriberName: subscriber.subscriberName,
  });

  const outcome = createDisconnectSyncError(subscriber.subscriberName, closeCode);
  await publishSyncError(subscriber.projectId, subscriber.topic, outcome);
}

/**
 * Clean up all pending acks for an endpoint (e.g. when WebSocket closes).
 */
export function cleanupPendingAcks(endpoint: string): void {
  for (const [eventId, entryMap] of pendingAcks) {
    const entry = entryMap.get(endpoint);
    if (entry) {
      clearTimeout(entry.timer);
      entryMap.delete(endpoint);
      if (entryMap.size === 0) {
        pendingAcks.delete(eventId);
      }
    }
  }
}

/**
 * Get the count of pending acks (for testing/debugging).
 */
export function getPendingAckCount(): number {
  let count = 0;
  for (const entryMap of pendingAcks.values()) {
    count += entryMap.size;
  }
  return count;
}
