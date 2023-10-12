import WS from 'jest-websocket-mock';
import { webcrypto } from 'node:crypto';
import {
  FhircastConnectEvent,
  FhircastConnection,
  FhircastDisconnectEvent,
  FhircastEventContext,
  FhircastMessageEvent,
  FhircastMessagePayload,
  SubscriptionRequest,
  createFhircastMessagePayload,
  serializeFhircastSubscriptionRequest,
  validateFhircastSubscriptionRequest,
} from '.';

// TODO: Remove this hack
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
});

function createFhircastMessageContext(patientId: string): FhircastEventContext {
  if (!patientId) {
    throw new Error('Must provide a patientId!');
  }
  return {
    key: 'patient',
    resource: {
      resourceType: 'Patient',
      id: patientId,
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MR',
                display: 'Medical Record Number',
              },
            ],
          },
        },
      ],
    },
  };
}

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

describe('serializeFhircastSubscriptionRequest', () => {
  test('Valid subscription request', () => {
    expect(
      serializeFhircastSubscriptionRequest({
        mode: 'subscribe',
        channelType: 'websocket',
        topic: 'abc123',
        events: ['patient-open'],
      })
    ).toEqual('hub.channel.type=websocket&hub.mode=subscribe&hub.topic=abc123&hub.events=patient-open');
  });

  test('Valid subscription request with multiple events', () => {
    expect(
      serializeFhircastSubscriptionRequest({
        mode: 'subscribe',
        channelType: 'websocket',
        topic: 'abc123',
        events: ['patient-open', 'patient-close'],
      })
    ).toEqual('hub.channel.type=websocket&hub.mode=subscribe&hub.topic=abc123&hub.events=patient-open%2Cpatient-close');
  });

  test('Valid subscription request with endpoint', () => {
    expect(
      serializeFhircastSubscriptionRequest({
        mode: 'subscribe',
        channelType: 'websocket',
        topic: 'abc123',
        events: ['patient-open'],
        endpoint: 'wss://abc.com/hub',
      })
    ).toEqual(
      'hub.channel.type=websocket&hub.mode=subscribe&hub.topic=abc123&hub.events=patient-open&endpoint=wss%3A%2F%2Fabc.com%2Fhub'
    );
  });

  test('Invalid subscription request', () => {
    expect(() =>
      serializeFhircastSubscriptionRequest({ mode: 'unsubscribe' } as unknown as SubscriptionRequest)
    ).toThrow(TypeError);
  });
});

// TODO: Test `createFhircastMessagePayload`

describe('FhircastConnection', () => {
  let wsServer: WS;
  let connection: FhircastConnection;

  beforeAll(() => {
    wsServer = new WS('ws://localhost:1234', { jsonProtocol: true });
  });

  afterAll(() => {
    WS.clean();
  });

  test('Constructor / .addEventListener("connect")', (done) => {
    const subRequest = {
      topic: 'abc123',
      mode: 'subscribe',
      channelType: 'websocket',
      events: ['patient-open'],
      endpoint: 'ws://localhost:1234',
    } satisfies SubscriptionRequest;

    connection = new FhircastConnection(subRequest);
    expect(connection).toBeDefined();

    const handler = (event: FhircastConnectEvent): void => {
      expect(event).toBeDefined();
      expect(event.type).toBe('connect');
      connection.removeEventListener('connect', handler);
      done();
    };
    connection.addEventListener('connect', handler);
  });

  test('.addEventListener("message")', (done) => {
    const message = createFhircastMessagePayload(
      'abc123',
      'patient-open',
      createFhircastMessageContext('patient-123')
    ) satisfies FhircastMessagePayload;

    const handler = (event: FhircastMessageEvent) => {
      expect(event).toBeDefined();
      expect(event.type).toBe('message');
      expect(event.payload).toEqual(message);
      connection.removeEventListener('message', handler);
      done();
    };
    connection.addEventListener('message', handler);
    wsServer.send(message);
  });

  test('.disconnect() / .addEventListener("disconnect")', (done) => {
    const handler = (event: FhircastDisconnectEvent) => {
      expect(event).toBeDefined();
      expect(event.type).toBe('disconnect');
      connection.removeEventListener('disconnect', handler);
      done();
    };
    connection.addEventListener('disconnect', handler);
    connection.disconnect();
  });
});
