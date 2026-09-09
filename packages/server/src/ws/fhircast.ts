// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId } from '@medplum/core';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import type { RawData, WebSocket } from 'ws';
import type { FhircastChannelMessage } from '../fhircast/utils';
import {
  extractEndpoint,
  FHIRCAST_LEASE_SECONDS,
  FhircastVersion,
  getEndpointSubscription,
  serializeFhircastChannelMessage,
} from '../fhircast/utils';
import { DEFAULT_HEARTBEAT_MS, heartbeat } from '../heartbeat';
import { globalLogger } from '../logger';
import { setGauge } from '../otel/otel';
import { publish } from '../pubsub';
import { getPubSubRedisSubscriber } from '../redis';

const hostname = os.hostname();
const METRIC_OPTIONS = { attributes: { hostname } };
let heartbeatHandler: (() => void) | undefined;

/**
 * What the Hub tracks for one connected subscriber: the topic it is listening to, and the events it
 * subscribed to, both read from its subscription in Redis when the socket connects.
 *
 * Events are lowercased for matching, the way the Hub already lowercases the name of a published
 * event to route it. The subscription in Redis keeps the casing the subscriber asked with.
 */
type ConnectedSubscriber = {
  projectAndTopic: string;
  events: Set<string>;
};

const websocketMap = new Map<WebSocket, ConnectedSubscriber>();
const topicRefCountMap = new Map<string, number>();
let fhircastMessagesSent = 0;
let fhircastMessagesReceived = 0;

export function initFhircastHeartbeat(): void {
  if (!heartbeatHandler) {
    heartbeatHandler = (): void => {
      const baseHeartbeatPayload = {
        timestamp: new Date().toISOString(),
        id: generateId(),
        event: {
          context: [{ key: 'period', decimal: `${Math.ceil(DEFAULT_HEARTBEAT_MS / 1000)}` }],
          'hub.event': 'heartbeat',
        },
      };

      for (const projectAndTopic of topicRefCountMap.keys()) {
        publish(
          projectAndTopic,
          serializeFhircastChannelMessage({
            ...baseHeartbeatPayload,
            event: { ...baseHeartbeatPayload.event, 'hub.topic': projectAndTopic.split(':')[1] },
          })
        ).catch((err) => globalLogger.error('[FHIRcast]: Failed to publish heartbeat', err));
      }

      const heartbeatSeconds = DEFAULT_HEARTBEAT_MS / 1000;
      setGauge('medplum.fhircast.websocketCount', websocketMap.size, METRIC_OPTIONS);
      setGauge('medplum.fhircast.topicCount', topicRefCountMap.size, METRIC_OPTIONS);
      setGauge('medplum.fhircast.messagesSentPerSec', fhircastMessagesSent / heartbeatSeconds, METRIC_OPTIONS);
      setGauge('medplum.fhircast.messagesReceivedPerSec', fhircastMessagesReceived / heartbeatSeconds, METRIC_OPTIONS);
      fhircastMessagesSent = 0;
      fhircastMessagesReceived = 0;
    };

    heartbeat.addEventListener('heartbeat', heartbeatHandler);
  }
}

export function stopFhircastHeartbeat(): void {
  if (heartbeatHandler) {
    heartbeat.removeEventListener('heartbeat', heartbeatHandler);
    heartbeatHandler = undefined;
  }
}

// Events delivered to every subscriber regardless of the events they subscribed to: `heartbeat`
// keeps the connection alive, and `syncerror` reports a context change the subscriber may have
// caused, so a subscriber can't opt out of hearing about its own failures.
// Source: https://build.fhir.org/ig/HL7/fhircast-docs/3-Events.html
const UNCONDITIONAL_EVENTS = new Set(['heartbeat', 'syncerror']);

/**
 * Decides what a subscriber should be sent from a message published to its topic.
 *
 * Everything the topic publishes reaches every one of its sockets, so this is where a message is
 * matched against the subscriber it targets, and against the events this subscriber asked for. A
 * payload carrying no `hub.event` is a Hub control message, delivered whatever the subscriber asked
 * for.
 * @param message - The raw message published to the topic.
 * @param endpoint - The endpoint this subscriber connected with.
 * @param subscribedEvents - The events this subscriber requested.
 * @returns The payload to forward, or `undefined` if the message is not for this subscriber.
 */
function messageForSubscriber(
  message: string,
  endpoint: string,
  subscribedEvents: Set<string>
): Record<string, any> | undefined {
  let channelMessage: FhircastChannelMessage | undefined;
  try {
    channelMessage = JSON.parse(message);
  } catch (_err) {
    channelMessage = undefined;
  }
  if (!channelMessage?.payload) {
    globalLogger.error('[FHIRcast]: Discarding a message published to a topic without a payload');
    return undefined;
  }
  if (channelMessage.target && channelMessage.target !== endpoint) {
    return undefined;
  }

  const eventName = channelMessage.payload.event?.['hub.event'];
  if (typeof eventName === 'string') {
    const normalizedEventName = eventName.toLowerCase();
    if (!UNCONDITIONAL_EVENTS.has(normalizedEventName) && !subscribedEvents.has(normalizedEventName)) {
      return undefined;
    }
  }
  return channelMessage.payload;
}

/**
 * Handles a new WebSocket connection to the FHIRcast hub.
 * @param socket - The WebSocket connection.
 * @param request - The HTTP request.
 */
export async function handleFhircastConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  const endpoint = extractEndpoint(request.url);

  const subscription = endpoint ? await getEndpointSubscription(endpoint) : undefined;
  if (!endpoint || !subscription) {
    globalLogger.error(`[FHIRcast]: No subscription associated with the endpoint '${endpoint}'`);
    // Close the socket since this endpoint is not valid
    socket.send(
      JSON.stringify({
        'hub.mode': 'denied',
        'hub.topic': '',
        'hub.events': '',
        'hub.reason': 'invalid endpoint',
      }),
      { binary: false }
    );
    fhircastMessagesSent++;
    socket.close();
    return;
  }

  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redisSubscriber = getPubSubRedisSubscriber();

  const { projectId, topic, events, version } = subscription;
  const projectAndTopic = `${projectId}:${topic}`;

  // Bind all listeners (and topic bookkeeping) before awaiting the subscribe, so that
  // messages published immediately after subscription are not dropped, and a socket that
  // closes during the subscribe still cleans up its Redis subscriber.
  const subscribed = redisSubscriber.subscribe(projectAndTopic);

  // Increment ref count for the specified topic
  topicRefCountMap.set(projectAndTopic, (topicRefCountMap.get(projectAndTopic) ?? 0) + 1);
  websocketMap.set(socket, { projectAndTopic, events: new Set(events.map((event) => event.toLowerCase())) });

  redisSubscriber.on('message', (_channel: string, message: string) => {
    const subscribedEvents = websocketMap.get(socket)?.events;
    if (!subscribedEvents) {
      // The socket is gone; nothing left to deliver to
      return;
    }
    const payload = messageForSubscriber(message, endpoint, subscribedEvents);
    if (!payload) {
      return;
    }
    // A denial ends this subscription, so the Hub closes the socket rather than leaving it to keep
    // receiving events until the subscriber gets around to it. Closing is deferred to the send
    // callback, which runs once the frame has been written to the socket, so the subscriber is still
    // told why. `close()` then completes the closing handshake, unlike `terminate()`.
    const onSent = payload['hub.mode'] === 'denied' ? (): void => socket.close() : undefined;
    // Forward the message to the client
    socket.send(JSON.stringify(payload), { binary: false }, onSent);
    fhircastMessagesSent++;
  });

  socket.on(
    'message',
    AsyncLocalStorage.bind(async (data: RawData) => {
      fhircastMessagesReceived++;
      try {
        const message = JSON.parse((data as Buffer).toString('utf8'));
        globalLogger.debug('message', message);
      } catch (err) {
        globalLogger.error('[FHIRcast]: Failed to parse client message', { err });
      }
    })
  );

  socket.on('close', () => {
    if (websocketMap.delete(socket)) {
      const topicRefCount = topicRefCountMap.get(projectAndTopic);
      if (!topicRefCount) {
        globalLogger.error('[FHIRcast]: No topic ref count for this topic');
      } else if (topicRefCount === 1) {
        topicRefCountMap.delete(projectAndTopic);
      } else {
        topicRefCountMap.set(projectAndTopic, topicRefCount - 1);
      }
    }
    redisSubscriber.disconnect();
  });

  // Wait for the subscription to be established before sending the connection verification.
  // Listeners are already bound above, so no messages are missed while this resolves.
  try {
    await subscribed;
  } catch (err) {
    globalLogger.error('[FHIRcast]: Failed to subscribe to topic', { err });
    socket.close();
    return;
  }

  // Send the subscription confirmation. STU3 defines exactly these four fields.
  // Source: https://build.fhir.org/ig/HL7/fhircast-docs/2-4-Subscribing.html#subscription-confirmation
  const confirmation: Record<string, unknown> = {
    'hub.mode': 'subscribe',
    'hub.topic': topic,
    'hub.events': events.join(','),
    'hub.lease_seconds': FHIRCAST_LEASE_SECONDS,
  };
  if (version !== FhircastVersion.STU3) {
    // STU3 dropped these, but STU2 clients still expect them
    // TODO: Fill in these properties
    Object.assign(confirmation, {
      'hub.callback': '',
      'hub.channel': '',
      'hub.secret': '',
      'hub.subscriber': '',
    });
  }
  socket.send(JSON.stringify(confirmation), { binary: false });
  fhircastMessagesSent++;
}
