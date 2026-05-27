// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { generateId } from '@medplum/core';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import type { RawData, WebSocket } from 'ws';
import { DEFAULT_HEARTBEAT_MS, heartbeat } from '../heartbeat';
import { globalLogger } from '../logger';
import { setGauge } from '../otel/otel';
import { getPubSubRedisSubscriber } from '../redis';
import { resolveEndpoint, getSubscriber } from '../fhircast-r4/subscriptions';
import { getCurrentContext } from '../fhircast-r4/context-store';
import { publishHeartbeat } from '../fhircast-r4/event-bus';
import { handleSubscriberResponse, handleAbnormalClose, cleanupPendingAcks, registerCloseSocketCallback } from '../fhircast-r4/sync-error';
import type { SubscriberResponse, SubscriptionConfirmation, SubscriptionDenial } from '../fhircast-r4/types';
import { DEFAULT_CONFIG, isSubscriberResponse, RedisKeys, subscriberWantsEvent } from '../fhircast-r4/types';

const hostname = os.hostname();
const METRIC_OPTIONS = { attributes: { hostname } };

/** Map of WebSocket -> subscriber info for active connections. */
const activeConnections = new Map<WebSocket, ActiveConnection>();

/** Map of endpoint -> WebSocket for looking up sockets by endpoint. */
const endpointToSocket = new Map<string, WebSocket>();

/** Set of active topic channels (projectId:topic) for heartbeat. */
const activeTopicChannels = new Map<string, number>();

let heartbeatHandler: (() => void) | undefined;
let r4MessagesSent = 0;
let r4MessagesReceived = 0;

interface ActiveConnection {
  endpoint: string;
  projectId: string;
  topic: string;
  events: string;
  subscriberName?: string;
  redisSubscriber: ReturnType<typeof getPubSubRedisSubscriber>;
  pingTimer?: ReturnType<typeof setInterval>;
  missedPongs: number;
}

/**
 * Initialize the FHIRcast R4 heartbeat.
 * Publishes heartbeat events to all active topics at the configured interval.
 */
export function initFhircastR4Heartbeat(): void {
  // Register the close-socket callback so sync-error.ts can disconnect non-responsive subscribers
  // without needing a cross-layer import from routes -> ws
  registerCloseSocketCallback(closeSocketForEndpoint);

  if (!heartbeatHandler) {
    heartbeatHandler = (): void => {
      const periodSeconds = Math.ceil(DEFAULT_HEARTBEAT_MS / 1000);

      for (const channelKey of activeTopicChannels.keys()) {
        const parts = channelKey.split(':');
        if (parts.length >= 2) {
          const projectId = parts[0];
          const topic = parts.slice(1).join(':');
          publishHeartbeat(projectId, topic, periodSeconds).catch((err: Error) => {
            globalLogger.error('[FHIRcast R4] Heartbeat publish error', { error: err.message });
          });
        }
      }

      // Report metrics
      const heartbeatSeconds = DEFAULT_HEARTBEAT_MS / 1000;
      setGauge('medplum.fhircast-r4.websocketCount', activeConnections.size, METRIC_OPTIONS);
      setGauge('medplum.fhircast-r4.topicCount', activeTopicChannels.size, METRIC_OPTIONS);
      setGauge('medplum.fhircast-r4.messagesSentPerSec', r4MessagesSent / heartbeatSeconds, METRIC_OPTIONS);
      setGauge('medplum.fhircast-r4.messagesReceivedPerSec', r4MessagesReceived / heartbeatSeconds, METRIC_OPTIONS);
      r4MessagesSent = 0;
      r4MessagesReceived = 0;
    };

    heartbeat.addEventListener('heartbeat', heartbeatHandler);
  }
}

/**
 * Stop the FHIRcast R4 heartbeat.
 */
export function stopFhircastR4Heartbeat(): void {
  if (heartbeatHandler) {
    heartbeat.removeEventListener('heartbeat', heartbeatHandler);
    heartbeatHandler = undefined;
  }
}

/**
 * Handle a new WebSocket connection to the FHIRcast R4 hub.
 *
 * Connection flow:
 * 1. Extract endpoint from URL path: /ws/fhircast-r4/{endpoint}
 * 2. Resolve endpoint to projectId:topic via Redis
 * 3. If invalid, send denial and close
 * 4. Create Redis subscriber for the topic channel
 * 5. Send subscription confirmation per spec
 * 6. Forward filtered events from Redis to WebSocket
 * 7. Track subscriber responses for ack/SyncError
 * 8. Ping/pong keepalive
 */
export async function handleFhircastR4Connection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  // Extract endpoint from URL: /ws/fhircast-r4/{endpoint}
  const urlParts = (request.url as string).split('/').filter(Boolean);
  const endpoint = urlParts[2]; // [0]='ws', [1]='fhircast-r4', [2]=endpoint

  if (!endpoint) {
    sendDenial(socket, '', '', 'missing endpoint in URL');
    socket.close();
    return;
  }

  // Resolve endpoint to project and topic
  const mapping = await resolveEndpoint(endpoint);
  if (!mapping) {
    globalLogger.error('[FHIRcast R4] No topic for endpoint', { endpoint });
    sendDenial(socket, '', '', 'invalid endpoint');
    socket.close();
    return;
  }

  const { projectId, topic } = mapping;

  // Get subscriber record to retrieve event filter
  const subscriber = await getSubscriber(projectId, topic, endpoint);
  const subscriberEvents = subscriber?.events || '';
  const subscriberName = subscriber?.subscriberName;
  const leaseSeconds = subscriber?.leaseSeconds ?? DEFAULT_CONFIG.defaultLeaseSeconds;

  // Create Redis subscriber for this connection
  const redisSubscriber = getPubSubRedisSubscriber();
  const channel = RedisKeys.topicChannel(projectId, topic);
  await redisSubscriber.subscribe(channel);

  // Track this connection
  const conn: ActiveConnection = {
    endpoint,
    projectId,
    topic,
    events: subscriberEvents,
    subscriberName,
    redisSubscriber,
    missedPongs: 0,
  };
  activeConnections.set(socket, conn);
  endpointToSocket.set(endpoint, socket);

  // Track topic ref count for heartbeat
  const topicKey = `${projectId}:${topic}`;
  activeTopicChannels.set(topicKey, (activeTopicChannels.get(topicKey) ?? 0) + 1);

  // Forward messages from Redis to WebSocket (with per-subscriber event filtering)
  redisSubscriber.on('message', (_channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message);
      const eventName = parsed._meta?.eventName || parsed.event?.['hub.event'];

      // Filter: only send events this subscriber wants
      if (eventName && subscriberEvents && !subscriberWantsEvent(subscriberEvents, eventName)) {
        return; // Skip - subscriber didn't subscribe to this event type
      }

      // Remove internal metadata before sending to client
      const { _meta, ...cleanPayload } = parsed;

      // Backpressure: check if socket buffer is full
      if (socket.bufferedAmount > 64 * 1024) {
        globalLogger.warn('[FHIRcast R4] Socket buffer full, dropping message', {
          endpoint,
          bufferedAmount: socket.bufferedAmount,
          eventName,
        });
        return;
      }

      socket.send(JSON.stringify(cleanPayload), { binary: false });
      r4MessagesSent++;
    } catch (err) {
      globalLogger.error('[FHIRcast R4] Error forwarding message', {
        endpoint,
        error: String(err),
      });
    }
  });

  // Handle messages from subscriber (ack responses)
  socket.on(
    'message',
    AsyncLocalStorage.bind(async (data: RawData) => {
      r4MessagesReceived++;
      try {
        const message = JSON.parse((data as Buffer).toString('utf8'));

        if (isSubscriberResponse(message)) {
          // Process ack response
          handleSubscriberResponse(endpoint, message as SubscriberResponse);
        } else {
          globalLogger.debug('[FHIRcast R4] Received non-ack message', { endpoint, message });
        }
      } catch (err) {
        globalLogger.error('[FHIRcast R4] Error parsing WebSocket message', {
          endpoint,
          error: String(err),
        });
      }
    })
  );

  // Handle WebSocket close
  socket.on('close', (code: number) => {
    const conn = activeConnections.get(socket);
    if (conn) {
      // Clean up ping timer
      if (conn.pingTimer) {
        clearInterval(conn.pingTimer);
      }

      // Clean up ack tracking
      cleanupPendingAcks(endpoint);

      // Handle abnormal close
      if (subscriber) {
        handleAbnormalClose(subscriber, code).catch((err) => {
          globalLogger.error('[FHIRcast R4] Error handling abnormal close', { error: String(err) });
        });
      }

      // Update topic ref count
      const topicKey = `${conn.projectId}:${conn.topic}`;
      const refCount = activeTopicChannels.get(topicKey);
      if (refCount && refCount > 1) {
        activeTopicChannels.set(topicKey, refCount - 1);
      } else {
        activeTopicChannels.delete(topicKey);
      }

      // Clean up maps
      activeConnections.delete(socket);
      endpointToSocket.delete(endpoint);

      // Disconnect Redis subscriber
      conn.redisSubscriber.disconnect();
    }
  });

  // Start ping/pong keepalive
  conn.pingTimer = setInterval(() => {
    if (conn.missedPongs >= DEFAULT_CONFIG.maxMissedPongs) {
      globalLogger.warn('[FHIRcast R4] Too many missed pongs, closing', { endpoint });
      socket.close(1001, 'Ping timeout');
      return;
    }
    conn.missedPongs++;
    socket.ping();
  }, DEFAULT_CONFIG.pingIntervalMs);

  socket.on('pong', () => {
    conn.missedPongs = 0;
  });

  // Send subscription confirmation per spec
  // See: https://build.fhir.org/ig/HL7/fhircast-docs/2-4-Subscribing.html#subscription-confirmation
  const confirmation: SubscriptionConfirmation = {
    'hub.mode': 'subscribe',
    'hub.topic': topic,
    'hub.events': subscriberEvents,
    'hub.lease_seconds': leaseSeconds,
  };
  socket.send(JSON.stringify(confirmation), { binary: false });
  r4MessagesSent++;

  // Send implicit open events for current context
  // Per spec: Hub MAY send implied open events when new subscriber connects
  await sendImplicitOpenEvents(socket, projectId, topic, subscriberEvents);

  globalLogger.info('[FHIRcast R4] WebSocket connected', {
    endpoint,
    projectId,
    topic,
    events: subscriberEvents,
    subscriberName,
  });
}

/**
 * Send implicit open events to a newly connected subscriber.
 * If there's a current context, send the appropriate *-open event
 * so the subscriber knows the current state.
 */
async function sendImplicitOpenEvents(
  socket: WebSocket,
  projectId: string,
  topic: string,
  subscriberEvents: string
): Promise<void> {
  try {
    const currentContext = await getCurrentContext(projectId, topic);
    if (!currentContext) {
      return; // No current context to send
    }

    const contextType = currentContext['context.type'];
    if (!contextType) {
      return;
    }

    const openEventName = `${contextType}-open`;

    // Only send if subscriber is subscribed to this open event
    if (subscriberEvents && !subscriberWantsEvent(subscriberEvents, openEventName)) {
      return;
    }

    // Filter out 'content' key from context for the open event
    // (content is only returned via GetCurrentContext)
    const contextWithoutContent = currentContext.context.filter((ctx) => ctx.key !== 'content');

    const openEvent = {
      timestamp: new Date().toISOString(),
      id: generateId(),
      event: {
        'hub.topic': topic,
        'hub.event': openEventName,
        'context.versionId': currentContext['context.versionId'],
        context: contextWithoutContent,
      },
    };

    socket.send(JSON.stringify(openEvent), { binary: false });
    r4MessagesSent++;

    globalLogger.debug('[FHIRcast R4] Sent implicit open event', {
      projectId,
      topic,
      eventName: openEventName,
    });
  } catch (err) {
    globalLogger.error('[FHIRcast R4] Error sending implicit open events', { error: String(err) });
  }
}

/**
 * Send a subscription denial message over WebSocket.
 */
function sendDenial(socket: WebSocket, topic: string, events: string, reason: string): void {
  const denial: SubscriptionDenial = {
    'hub.mode': 'denied',
    'hub.topic': topic,
    'hub.events': events,
    'hub.reason': reason,
  };
  socket.send(JSON.stringify(denial), { binary: false });
  r4MessagesSent++;
}

/**
 * Close the WebSocket for a specific endpoint.
 * Used by sync-error.ts to disconnect non-responsive subscribers.
 */
export function closeSocketForEndpoint(endpoint: string): void {
  const socket = endpointToSocket.get(endpoint);
  if (socket) {
    sendDenial(socket, '', '', 'Subscription terminated due to non-responsiveness');
    socket.close(1000, 'Unsubscribed');
  }
}

/**
 * Get the active connection count (for testing/debugging).
 */
export function getActiveConnectionCount(): number {
  return activeConnections.size;
}
