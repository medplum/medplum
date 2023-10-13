import type { Resource } from '@medplum/fhirtypes';
import { TypedEventTarget } from '../eventtarget';

const FHIRCAST_EVENT_NAMES = {
  'patient-open': 'patient-open',
  'patient-close': 'patient-close',
  'imagingstudy-open': 'imagingstudy-open',
  'imagingstudy-close': 'imagingstudy-close',
} as const;

const FHIRCAST_RESOURCE_TYPES = ['Patient', 'ImagingStudy'] as const;

export type FhircastEventName = keyof typeof FHIRCAST_EVENT_NAMES;
export type FhircastResourceType = (typeof FHIRCAST_RESOURCE_TYPES)[number];

export function isFhircastResourceType(resourceType: FhircastResourceType): boolean {
  return FHIRCAST_RESOURCE_TYPES.includes(resourceType);
}

/**
 * A `FHIRcast` subscription request.
 *
 * Can be passed to `MedplumClient.fhircastConnect` or `MedplumClient.fhircastUnsubscribe` to either open a `FHIRcast` connection, or unsubscribe from the subscription.
 */
export type SubscriptionRequest = {
  channelType: 'websocket';
  mode: 'subscribe' | 'unsubscribe';
  events: FhircastEventName[];
  topic: string;
  endpoint?: string;
};

export type FhircastEventContext = {
  key: string;
  resource: Resource & { resourceType: FhircastResourceType; id: string };
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
  if (!validateFhircastSubscriptionRequest(subscriptionRequest)) {
    throw new TypeError('subscriptionRequest must be an object conforming to SubscriptionRequest type');
  }

  const { channelType, mode, topic, events, endpoint } = subscriptionRequest;

  const formattedSubRequest = {
    'hub.channel.type': channelType,
    'hub.mode': mode,
    'hub.topic': topic,
    'hub.events': events.join(','),
  } as Record<string, string>;

  if (endpoint) {
    formattedSubRequest.endpoint = endpoint;
  }
  return new URLSearchParams(formattedSubRequest).toString();
}

/**
 * Validates that a `SubscriptionRequest`.
 *
 * @param subscriptionRequest The `SubscriptionRequest` to validate.
 * @returns A `boolean` indicating whether or not the `SubscriptionRequest` is valid.
 */
export function validateFhircastSubscriptionRequest(subscriptionRequest: SubscriptionRequest): boolean {
  if (typeof subscriptionRequest !== 'object') {
    return false;
  }
  const { channelType, mode, topic, events, endpoint } = subscriptionRequest;
  if (!(channelType && mode && topic && events)) {
    return false;
  }
  if (typeof topic !== 'string') {
    return false;
  }
  if (typeof events !== 'object' || !Array.isArray(events) || events.length < 1) {
    return false;
  }
  if (channelType !== 'websocket') {
    return false;
  }
  if (mode !== 'subscribe' && mode !== 'unsubscribe') {
    return false;
  }
  for (const event of events) {
    if (!FHIRCAST_EVENT_NAMES[event]) {
      return false;
    }
  }
  if (endpoint && !(typeof endpoint === 'string' && endpoint.startsWith('ws'))) {
    return false;
  }
  return true;
}

/**
 * Throws if any context in the given array of contexts is invalid.
 *
 * @param contexts The FHIRcast event contexts to validate.
 */
function validateFhircastContexts(contexts: FhircastEventContext[]): void {
  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i];
    if (!(context.key && typeof context.key === 'string')) {
      throw new TypeError(`context[${i}] is invalid! Context must contain a key!`);
    }
    if (typeof context.resource !== 'object') {
      throw new TypeError(
        `context[${i}] is invalid! Context must contain a single valid FHIR resource! Resource is not an object.`
      );
    }
    if (!(context.resource.id && typeof context.resource.id === 'string')) {
      throw new TypeError(`context[${i}] is invalid! Resource must contain a valid string ID.`);
    }
    if (!context.resource.resourceType) {
      throw new TypeError(`context[${i}] is invalid! Resource must contain a resource type. No resource type found.`);
    }
    if (!isFhircastResourceType(context.resource.resourceType)) {
      throw new TypeError(
        `context[${i}] is invalid! Resource must contain a valid resource type. Resource type is not a known resource type.`
      );
    }
  }
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
  context: FhircastEventContext | FhircastEventContext[]
): FhircastMessagePayload {
  if (!(topic && typeof topic === 'string')) {
    throw new TypeError('Must provide a topic!');
  }
  if (!FHIRCAST_EVENT_NAMES[event]) {
    throw new TypeError(
      `Must provide a valid FHIRcast event name! Supported events: ${Object.keys(FHIRCAST_EVENT_NAMES).join(', ')}`
    );
  }
  if (typeof context !== 'object') {
    throw new TypeError('context must be a context object or array of context objects!');
  }

  const normalizedContexts = Array.isArray(context) ? context : [context];
  // This will throw if any context in the array is invalid
  validateFhircastContexts(normalizedContexts);
  return {
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
    event: {
      'hub.topic': topic,
      'hub.event': event,
      context: normalizedContexts,
    },
  };
}

export type FhircastConnectEvent = { type: 'connect' };
export type FhircastMessageEvent = { type: 'message'; payload: FhircastMessagePayload };
export type FhircastDisconnectEvent = { type: 'disconnect' };

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
      throw new TypeError('Subscription request should contain an endpoint!');
    }
    if (!validateFhircastSubscriptionRequest(subRequest)) {
      throw new TypeError('Subscription request failed validation!');
    }
    const websocket = new WebSocket(subRequest.endpoint);
    websocket.addEventListener('open', () => {
      this.dispatchEvent({ type: 'connect' });

      websocket.addEventListener('message', (event: MessageEvent) => {
        const message = JSON.parse(event.data) as Record<string, string | object>;

        // This is a check for `subscription request confirmations`, we just discard these for now
        if (message['hub.topic']) {
          return;
        }

        const fhircastMessage = message as unknown as FhircastMessagePayload;
        this.dispatchEvent({ type: 'message', payload: fhircastMessage });

        websocket.send(
          JSON.stringify({
            id: message?.id,
            timestamp: new Date().toISOString(),
          })
        );
      });

      websocket.addEventListener('close', () => {
        this.dispatchEvent({ type: 'disconnect' });
      });
    });
    this.websocket = websocket;
  }

  disconnect(): void {
    this.websocket.close();
  }
}
