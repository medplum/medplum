import type { Resource } from '@medplum/fhirtypes';
type EventName = string;

export type SubscriptionRequest = {
  channelType: 'websocket';
  mode: 'subscribe' | 'unsubscribe';
  events: EventName[];
  topic: string;
  endpoint?: URL;
};

export type FhircastHubEventContext = {
  key: string;
  resource: Resource;
};

export type FhircastHubEvent = {
  'hub.topic': string;
  'hub.event': string;
  context: FhircastHubEventContext[];
};

export type ISOTimestamp = string;

export type FhircastMessagePayload = {
  timestamp: ISOTimestamp;
  id: string;
  event: FhircastHubEvent;
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
