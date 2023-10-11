import { validateFhircastSubscriptionRequest } from '.';

// TODO: Test serializeFhircastSubscriptionRequest

describe('validateFhircastSubscriptionRequest', () => {
  test('Valid subscription requests', () => {
    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'subscribe',
        channelType: 'websocket',
        events: ['patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: ['patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: ['patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: ['imagingstudy-open', 'patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'subscribe',
        channelType: 'websocket',
        events: ['patient-open'],
        endpoint: 'wss://abc.com/hub',
      })
    ).toBe(true);
  });

  test('Invalid subscription requests', () => {
    // Must have at least one event
    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: [],
      })
    ).toBe(false);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        // @ts-expect-error events must be a EventName[]
        events: 'patient-open',
      })
    ).toBe(false);

    expect(
      // @ts-expect-error must include events prop
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
      })
    ).toBe(false);

    expect(
      // @ts-expect-error must include topic prop
      validateFhircastSubscriptionRequest({
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: ['patient-open'],
      })
    ).toBe(false);

    expect(
      validateFhircastSubscriptionRequest({
        // @ts-expect-error mode must be `subscribe` | `unsubscribe`
        mode: 'subscreebe',
        topic: 'abc123',
        channelType: 'websocket',
        events: ['patient-open'],
      })
    ).toBe(false);

    expect(
      validateFhircastSubscriptionRequest({
        mode: 'subscribe',
        topic: 'abc123',
        // @ts-expect-error channelType must be `websocket`
        channelType: 'webhooks',
        events: ['patient-open'],
      })
    ).toBe(false);

    // Endpoint must be either ws:// or wss://
    expect(
      validateFhircastSubscriptionRequest({
        mode: 'subscribe',
        topic: 'abc123',
        channelType: 'websocket',
        events: ['patient-open'],
        endpoint: 'http://abc.com/hub',
      })
    ).toBe(false);
  });
});

// TODO: Test `FhircastConnection`
