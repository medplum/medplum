type EventName = string;

export type WorkflowEvent = {
  name: EventName;
  topic: string;
  payload: Record<string, any>;
};

export type PatientOpenEvent = {
  name: 'patient-open';
  topic: string;
  patientId: string;
};

export type Subscription = {
  subscriberId: string;
  topic: string;
  events: EventName[];
};

export type SubscriptionRequest = {
  channelType: 'websocket';
  mode: 'subscribe' | 'unsubscribe';
  events: EventName[];
  topic: string;
  endpoint?: URL;
};

export type SubscriptionConfirmation = {
  mode: 'subscribe';
  events: EventName[];
  topic: string;
  leaseSeconds: number;
};

export type SubscriptionConfirmationSerialized = {
  'hub.mode': 'subscribe';
  'hub.events': string;
  'hub.topic': string;
  'hub.lease_seconds': number;
};

export type FHIRResource = {
  resourceType: 'Patient';
  id: string;
  identifier: {
    type: {
      coding: any[];
    };
  }[];
};

export type FHIRcastHubEventContext = {
  key: string;
  resource: FHIRResource;
};

export type FHIRcastHubEvent = {
  'hub.topic': string;
  'hub.event': string;
  context: FHIRcastHubEventContext[];
};

export type ISOTimestamp = string;

export type FHIRcastMessagePayload = {
  timestamp: ISOTimestamp;
  id: string;
  event: FHIRcastHubEvent;
};

export function serializeHubSubscription(subscription: Subscription): string {
  return new URLSearchParams({
    ...subscription,
    events: subscription.events.join(','),
  }).toString();
}

export function deserializeHubSubscription(urlEncodedSubscription: string): Subscription {
  const searchParams = new URLSearchParams(urlEncodedSubscription);
  if (!searchParams.has('subscriberId')) {
    throw new Error('Must include `subscriberId` in hub subscription!');
  }
  if (!searchParams.has('topic')) {
    throw new Error('Must include `topic` in hub subscription!');
  }
  if (!searchParams.has('events')) {
    throw new Error('Must include `events` in hub subscription!');
  }
  return {
    subscriberId: searchParams.get('subscriberId') as string,
    topic: searchParams.get('topic') as string,
    events: searchParams.get('events')?.split(',') as string[],
  };
}

export function serializeHubSubscriptionRequest(subscriptionRequest: SubscriptionRequest): string {
  const formattedSubRequest = {
    'hub.channel.type': subscriptionRequest.channelType,
    'hub.mode': subscriptionRequest.mode,
    'hub.topic': subscriptionRequest.topic,
    'hub.events': subscriptionRequest.events.join(','),
  };
  return new URLSearchParams(formattedSubRequest).toString();
}

export function deserializeHubSubscriptionRequest(urlEncodedSubRequest: string): SubscriptionRequest {
  const searchParams = new URLSearchParams(urlEncodedSubRequest);
  if (!searchParams.has('hub.channel.type')) {
    throw new Error('Must include `hub.channel.type` in hub subscription!');
  }
  if (!searchParams.has('hub.mode')) {
    throw new Error('Must include `hub.mode` in hub subscription!');
  }
  if (!searchParams.has('hub.topic')) {
    throw new Error('Must include `hub.topic` in hub subscription!');
  }
  if (!searchParams.has('hub.events')) {
    throw new Error('Must include `hub.events` in hub subscription!');
  }
  return {
    channelType: searchParams.get('hub.channel.type') as 'websocket',
    mode: searchParams.get('hub.mode') as 'subscribe' | 'unsubscribe',
    topic: searchParams.get('hub.topic') as string,
    events: searchParams.get('hub.events')?.split(',') as string[],
  };
}

export function serializeHubSubscriptionConfirmation(
  subscriptionConfirmation: SubscriptionConfirmation
): SubscriptionConfirmationSerialized {
  const { events, mode, topic, leaseSeconds } = subscriptionConfirmation;
  return {
    'hub.mode': mode,
    'hub.topic': topic,
    'hub.events': events.join(','),
    'hub.lease_seconds': leaseSeconds,
  };
}

export function isWebSocketMessage(value: unknown): value is WebSocketMessage {
  // @ts-expect-error unknown type
  if (!(value?.type && value?.payload)) {
    return false;
  }
  return true;
}

export type WebSocketMessage = {
  type: string;
  payload: Record<string, any>;
};

export type WebSocketLike = {
  send: (data: string | ArrayBufferLike) => void;
};

export type WrappedWebSocket<T extends WebSocketLike> = {
  ws: T;
  sendMessage: (message: WebSocketMessage) => void;
};

export type WrappedWebSocketFhir<T extends WebSocketLike> = {
  ws: T;
  sendMessage: (message: FHIRcastMessagePayload) => void;
};
