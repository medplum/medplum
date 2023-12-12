import { IncomingMessage } from 'http';
import crypto from 'node:crypto';
import ws from 'ws';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function handleR4SubscriptionConnection(socket: ws.WebSocket, request: IncomingMessage): Promise<void> {
  const redis = getRedis();
  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redisSubscriber = redis.duplicate();

  // Get current subscriptions based on ::usubscriptions/r4::bindings::${token}
  const token = request.headers.authorization?.replace('Bearer ', '') as string;
  const subscriptionsStr = await redis.get(
    `::subscriptions/r4::bindings::${textDecoder.decode(
      await crypto.subtle.digest('sha-256', textEncoder.encode(token))
    )}`
  );
  if (!subscriptionsStr) {
    globalLogger.info(`No subscriptions found for user using token ${token}`);
    return;
  }
  const subscriptions = subscriptionsStr.split(',');
  await redisSubscriber.subscribe(...subscriptions);

  // How do we identify who the subscription is for?

  // Unsubscribing / cleanup? How does that work?

  // Keep list of active websocket subscriptions in a shortlist? (cache them)
  // When update to a given resource happens, check list of active subscriptions for criteria
  // If one matches, find the associated
  //

  // Can these subscriptions be persistent? No, shouldn't be probably

  // FLOW:
  // Create subscription resource via FHIR API
  // Get binding token via $get-ws-binding-token operation
  // Open WebSocket connection to the provided URL
  // Send: bind-with-token event (?)
  // Get back bundle: Handshake
  // Get back bundle: heartbeat (todo?)

  // Get back bundle: event-notification:
  // For each incoming "event", query against active in-memory subscriptions
  // If passed, find associated Redis channel, publish notification there

  // TODO now:
  // - Add handshake bundle event
  // - Add normal dispatch of events where subscriptions are checked for
  // - When finding a matching subscription, do reverse lookup for channels associated with subscription, publish event to the channel via redis

  // TODO: Add route for all subscriptions
  // TODO: Add optional ID for subscription route
  // TODO: Add heartbeat after refactor for agent, FHIRcast heartbeat

  redisSubscriber.on('message', (channel: string, message: string) => {
    globalLogger.debug('[WS] redis message', { channel, message });
    socket.send(message, { binary: false });
  });

  socket.on('message', async (data: ws.RawData) => {
    globalLogger.debug('[WS] received data', { data: (data as Buffer).toString() });
  });

  socket.on('close', async () => {
    redisSubscriber.disconnect();
  });
}
