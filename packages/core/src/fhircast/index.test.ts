import WS from 'jest-websocket-mock';
import {
  FhircastConnectEvent,
  FhircastConnection,
  FhircastDisconnectEvent,
  FhircastMessageEvent,
  FhircastMessagePayload,
  SubscriptionRequest,
  createFhircastMessagePayload,
  serializeFhircastSubscriptionRequest,
  validateFhircastSubscriptionRequest,
} from '.';
import { OperationOutcomeError } from '../outcomes';
import { createFhircastMessageContext } from './test-utils';

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
    ).toThrow(OperationOutcomeError);
  });
});

describe('createFhircastMessagePayload', () => {
  test('Valid message creation with single context', () => {
    const topic = 'abc123';
    const event = 'patient-open';
    const resourceId = 'patient-123';
    const context = createFhircastMessageContext<typeof event>('patient', 'Patient', resourceId);

    const messagePayload = createFhircastMessagePayload(topic, event, context);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': topic, 'hub.event': event, context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toEqual(context);
  });

  test('Valid message with array of contexts', () => {
    const topic = 'abc123';
    const event = 'imagingstudy-open';
    const resourceId1 = 'patient-123';
    const context1 = createFhircastMessageContext<typeof event>('patient', 'Patient', resourceId1);
    const resourceId2 = 'imagingstudy-456';
    const context2 = createFhircastMessageContext<typeof event>('study', 'ImagingStudy', resourceId2);

    const messagePayload = createFhircastMessagePayload(topic, event, [context1, context2]);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': topic, 'hub.event': event, context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toEqual(context1);
    expect(messagePayload.event.context[1]).toEqual(context2);
  });

  test('Valid message with optional context included', () => {
    const topic = 'abc123';
    const event = 'patient-open';
    const resourceId1 = 'patient-123';
    const context1 = createFhircastMessageContext<typeof event>('patient', 'Patient', resourceId1);
    const resourceId2 = 'encounter-456';
    const context2 = createFhircastMessageContext<typeof event>('encounter', 'Encounter', resourceId2);

    const messagePayload = createFhircastMessagePayload(topic, event, [context1, context2]);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': topic, 'hub.event': event, context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toEqual(context1);
    expect(messagePayload.event.context[1]).toEqual(context2);
  });

  test('Syncerror', () => {
    expect(
      createFhircastMessagePayload('abc-123', 'syncerror', {
        key: 'operationoutcome',
        resource: { resourceType: 'OperationOutcome', id: 'patient-123' },
      })
    ).toEqual<FhircastMessagePayload<'syncerror'>>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': 'abc-123', 'hub.event': 'syncerror', context: expect.any(Object) },
    });
  });

  test('Invalid topic', () => {
    expect(() =>
      createFhircastMessagePayload(
        // @ts-expect-error Invalid topic, must be a string
        123,
        'imagingstudy-open',
        [
          createFhircastMessageContext<'imagingstudy-open'>('patient', 'Patient', 'patient-123'),
          createFhircastMessageContext<'imagingstudy-open'>('study', 'ImagingStudy', 'imagingstudy-123'),
        ]
      )
    ).toThrowError(OperationOutcomeError);
  });

  test('Invalid event name', () => {
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        // @ts-expect-error Invalid event, must be one of the enumerated FHIRcast events
        'imagingstudy-create',
        [
          createFhircastMessageContext<'imagingstudy-open'>('patient', 'Patient', 'patient-123'),
          createFhircastMessageContext<'imagingstudy-open'>('study', 'ImagingStudy', 'imagingstudy-123'),
        ]
      )
    ).toThrowError(OperationOutcomeError);
  });

  test('Invalid context', () => {
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'imagingstudy-open',
        // @ts-expect-error Invalid context, must be of type FhircastEventContext | FhircastEventContext[]
        { id: 'imagingstudy-123' }
      )
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'imagingstudy-open',
        // @ts-expect-error Invalid context, resource must have an ID
        { key: 'patient', resource: { resourceType: 'Patient' } }
      )
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'imagingstudy-open',
        // @ts-expect-error Invalid resource, resourceType required
        { key: 'patient', resource: { id: 'patient-123' } }
      )
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'imagingstudy-open',
        // @ts-expect-error Invalid resourceType, must be a FHIRcast-related resource
        { key: 'patient', resource: { resourceType: 'Observation', id: 'observation-123' } }
      )
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'imagingstudy-open',
        // @ts-expect-error Invalid context, must have a valid resource AND a key
        { resource: { resourceType: 'Patient', id: 'patient-123' } }
      )
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'patient-open',
        // @ts-expect-error Invalid context, must have a valid resource AND a key
        { key: 'subject', resource: { resourceType: 'Patient', id: 'patient-123' } }
      )
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'patient-open',
        // @ts-expect-error Invalid context, must have a valid resource AND a key
        { key: 'imagingstudy', resource: { resourceType: 'ImagingStudy', id: 'patient-123' } }
      )
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      // Should throw because keys must be unique
      createFhircastMessagePayload('abc-123', 'imagingstudy-open', [
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-456' } },
        { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-789' } },
      ])
    ).toThrowError(OperationOutcomeError);
    expect(() =>
      // Should throw because patient-open has an optional 2nd context of `Encounter`
      createFhircastMessagePayload('abc-123', 'patient-open', [
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        // @ts-expect-error 'study' is not a valid key on 'patient-open' event
        { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-456' } },
      ])
    ).toThrowError(OperationOutcomeError);
  });

  test('Valid `DiagnosticReport-open` event w/ multiple studies', () => {
    const payload = createFhircastMessagePayload('abc-123', 'diagnosticreport-open', [
      { key: 'report', resource: { resourceType: 'DiagnosticReport', id: 'report-789' } },
      { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
      { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-123' } },
      { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-456' } },
      { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-789' } },
    ]);
    expect(payload).toEqual<FhircastMessagePayload<'diagnosticreport-open'>>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': 'abc-123', 'hub.event': 'diagnosticreport-open', context: expect.any(Object) },
    });
    expect(payload.event.context.length).toEqual(5);
  });

  test('Invalid `DiagnosticReport-open` event w/ multiple reports', () => {
    expect(() =>
      createFhircastMessagePayload('abc-123', 'diagnosticreport-open', [
        { key: 'report', resource: { resourceType: 'DiagnosticReport', id: 'report-789' } },
        { key: 'report', resource: { resourceType: 'DiagnosticReport', id: 'report-789' } },
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-123' } },
      ])
    ).toThrowError(OperationOutcomeError);
  });

  test('Valid `DiagnosticReport-select` event', () => {
    const messagePayload = createFhircastMessagePayload('abc-123', 'diagnosticreport-select', [
      { key: 'report', resource: { resourceType: 'DiagnosticReport', id: 'report-123' } },
      { key: 'select', resources: [{ resourceType: 'Observation', id: 'observation-123' }] },
    ]);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': 'abc-123', 'hub.event': 'diagnosticreport-select', context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toBeDefined();
  });

  test('Using single resource context for multi-resource context', () => {
    expect(() =>
      createFhircastMessagePayload('abc-123', 'diagnosticreport-select', [
        { key: 'report', resource: { resourceType: 'DiagnosticReport', id: 'report-123' } },
        // @ts-expect-error Should have an array of resources at 'resources'
        { key: 'select', resource: { resourceType: 'Bundle', id: 'bundle-123' } },
      ])
    ).toThrowError(OperationOutcomeError);
  });

  test('Valid `DiagnosticReport-update` event', () => {
    const messagePayload = createFhircastMessagePayload('abc-123', 'diagnosticreport-update', [
      { key: 'report', resource: { resourceType: 'DiagnosticReport', id: 'report-123' } },
      { key: 'updates', resource: { resourceType: 'Bundle', id: 'bundle-123' } },
    ]);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': 'abc-123', 'hub.event': 'diagnosticreport-update', context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toBeDefined();
  });
});

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
      createFhircastMessageContext<'patient-open'>('patient', 'Patient', 'patient-123')
    ) satisfies FhircastMessagePayload<'patient-open'>;

    const handler = (event: FhircastMessageEvent): void => {
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
    const handler = (event: FhircastDisconnectEvent): void => {
      expect(event).toBeDefined();
      expect(event.type).toBe('disconnect');
      connection.removeEventListener('disconnect', handler);
      done();
    };
    connection.addEventListener('disconnect', handler);
    connection.disconnect();
  });
});
