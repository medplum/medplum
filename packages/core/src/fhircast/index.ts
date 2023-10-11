import type { Resource } from '@medplum/fhirtypes';
import { TypedEventTarget } from '../eventtarget';

export type FhircastEventName = 'patient-open' | 'patient-close' | 'imagingstudy-open' | 'imagingstudy-close';

export type SubscriptionRequest = {
  channelType: 'websocket';
  mode: 'subscribe' | 'unsubscribe';
  events: FhircastEventName[];
  topic: string;
  endpoint?: string;
};

export type FhircastEventContext = {
  key: string;
  resource: Resource;
};

export type FhircastEventPayload = {
  'hub.topic': string;
  'hub.event': string;
  context: FhircastEventContext[];
};

export type ISOTimestamp = string;

export type FhircastMessagePayload = {
  timestamp: ISOTimestamp;
  id: string;
  event: FhircastEventPayload;
};

/**
 * Creates a serialized url-encoded payload for a `FHIRcast` subscription from a `SubscriptionRequest` object that can be directly used in an HTTP request to the Hub.
 *
 * @param subscriptionRequest An object representing a subscription request.
 * @returns A serialized subscription in url-encoded form.
 */
export function serializeFhircastSubscriptionRequest(subscriptionRequest: SubscriptionRequest): string {
  const formattedSubRequest = {
    'hub.channel.type': subscriptionRequest.channelType,
    'hub.mode': subscriptionRequest.mode,
    'hub.topic': subscriptionRequest.topic,
    'hub.events': subscriptionRequest.events.join(','),
  } as Record<string, string>;

  if (subscriptionRequest.endpoint) {
    formattedSubRequest.endpoint = subscriptionRequest.endpoint;
  }
  return new URLSearchParams(formattedSubRequest).toString();
}

// TODO: Make this more accurate
export function validateFhircastSubscriptionRequest(subscriptionRequest: SubscriptionRequest): boolean {
  if (typeof subscriptionRequest !== 'object') {
    return false;
  }
  if (
    !(
      subscriptionRequest.channelType &&
      subscriptionRequest.mode &&
      subscriptionRequest.topic &&
      subscriptionRequest.events
    )
  ) {
    return false;
  }
  if (
    typeof subscriptionRequest.events !== 'object' ||
    !Array.isArray(subscriptionRequest.events) ||
    subscriptionRequest.events.length < 1
  ) {
    return false;
  }
  return true;
}

/**
 * Creates a serializable JSON payload for the `FHIRcast` protocol
 *
 * @param topic The topic that this message will be published on. Usually a UUID.
 * @param event The event name, ie. "patient-open" or "patient-close".
 * @param context The updated context, containing new versions of resources related to this event.
 * @returns A serializable `FhircastMessagePayload`.
 */
export function createFhircastMessagePayload(
  topic: string,
  event: FhircastEventName,
  context: FhircastEventContext[]
): FhircastMessagePayload {
  if (!topic) {
    throw new Error('Must provide a topic!');
  }
  return {
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
    event: {
      'hub.topic': topic,
      'hub.event': event,
      context,
    },
  };
}

export type FhircastConnectEvent = { name: 'connect' };
export type FhircastMessageEvent = { name: 'message'; payload: FhircastMessagePayload };
export type FhircastDisconnectEvent = { name: 'disconnect' };

export type FhircastSubscriptionEventMap = {
  connect: FhircastConnectEvent;
  message: FhircastMessageEvent;
  disconnect: FhircastDisconnectEvent;
};

/**
 * A class representing a `FHIRcast` connection.
 *
 * `FhircastConnection` extends `EventTarget` and emits 3 lifecycle events:
 * 1. `connect` - An event to signal when a WebSocket connection has been opened. Fired as soon as a WebSocket emits `open`.
 * 2. `message` - Contains a `payload` field containing a `FHIRcast` message payload exactly as it comes in over WebSockets.
 * 3. `disconnect` - An event to signal when a WebSocket connection has been closed. Fired as soon as a WebSocket emits `close`.
 *
 * To close the connection, call `connection.disconnect()` and listen to the `disconnect` event to know when the connection has been disconnected.
 */
export class FhircastConnection extends TypedEventTarget<FhircastSubscriptionEventMap> {
  subRequest: SubscriptionRequest;
  private websocket: WebSocket;

  /**
   * Creates a new `FhircastConnection`.
   * @param subRequest The subscription request to initialize the connection from.
   */
  constructor(subRequest: SubscriptionRequest) {
    super();
    this.subRequest = subRequest;
    if (!subRequest.endpoint) {
      throw new Error('Subscription request should contain an endpoint!');
    }
    const websocket = new WebSocket(subRequest.endpoint);
    websocket.addEventListener('open', () => {
      this.dispatchEvent({ name: 'connect' });

      websocket.addEventListener('message', (event: MessageEvent) => {
        const message = JSON.parse(event.data) as Record<string, string | object>;

        // This is a check for `subscription request confirmations`, we just discard these for now
        if (message['hub.topic']) {
          return;
        }

        const fhircastMessage = message as unknown as FhircastMessagePayload;
        this.dispatchEvent({ name: 'message', payload: fhircastMessage });

        websocket.send(
          JSON.stringify({
            id: message?.id,
            timestamp: new Date().toISOString(),
          })
        );
      });

      websocket.addEventListener('close', () => {
        this.dispatchEvent({ name: 'disconnect' });
      });
    });
    this.websocket = websocket;
  }

  disconnect(): void {
    this.websocket.close();
  }
}
