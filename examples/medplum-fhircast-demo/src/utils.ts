type EventName = string;

export type SubscriptionRequest = {
  channelType: 'websocket';
  mode: 'subscribe' | 'unsubscribe';
  events: EventName[];
  topic: string;
  endpoint?: URL;
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
