// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import WS from 'jest-websocket-mock';
import {
  assertContextVersionOptional,
  createFhircastMessagePayload,
  FHIRCAST_EVENT_VERSION_REQUIRED,
  FhircastConnectEvent,
  FhircastConnection,
  FhircastDiagnosticReportOpenContext,
  FhircastDiagnosticReportUpdateContext,
  FhircastDisconnectEvent,
  FhircastImagingStudyOpenContext,
  FhircastMessageEvent,
  FhircastMessagePayload,
  FhircastPatientOpenContext,
  isContextVersionRequired,
  serializeFhircastSubscriptionRequest,
  SubscriptionRequest,
  validateFhircastSubscriptionRequest,
} from '.';
import { generateId } from '../crypto';
import { OperationOutcomeError } from '../outcomes';

describe('validateFhircastSubscriptionRequest', () => {
  test('Valid subscription requests', () => {
    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'subscribe',
        channelType: 'websocket',
        events: ['Patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: ['Patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: ['Patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'unsubscribe',
        channelType: 'websocket',
        events: ['ImagingStudy-open', 'Patient-open'],
      })
    ).toBe(true);

    expect(
      validateFhircastSubscriptionRequest({
        topic: 'abc123',
        mode: 'subscribe',
        channelType: 'websocket',
        events: ['Patient-open'],
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
        events: 'Patient-open',
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
        events: ['Patient-open'],
      })
    ).toBe(false);

    expect(
      validateFhircastSubscriptionRequest({
        // @ts-expect-error mode must be `subscribe` | `unsubscribe`
        mode: 'subscreebe',
        topic: 'abc123',
        channelType: 'websocket',
        events: ['Patient-open'],
      })
    ).toBe(false);

    expect(
      validateFhircastSubscriptionRequest({
        mode: 'subscribe',
        topic: 'abc123',
        // @ts-expect-error channelType must be `websocket`
        channelType: 'webhooks',
        events: ['Patient-open'],
      })
    ).toBe(false);

    // Endpoint must be either ws:// or wss://
    expect(
      validateFhircastSubscriptionRequest({
        mode: 'subscribe',
        topic: 'abc123',
        channelType: 'websocket',
        events: ['Patient-open'],
        endpoint: 'http://abc.com/hub',
      })
    ).toBe(false);

    expect(
      validateFhircastSubscriptionRequest({
        mode: 'subscribe',
        // @ts-expect-error Topic needs to be a string
        topic: 12,
        channelType: 'websocket',
        events: ['Patient-open'],
      })
    ).toBe(false);

    expect(
      // @ts-expect-error subscriptionRequest must be an object
      validateFhircastSubscriptionRequest(undefined)
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
        events: ['Patient-open'],
      })
    ).toStrictEqual('hub.channel.type=websocket&hub.mode=subscribe&hub.topic=abc123&hub.events=Patient-open');
  });

  test('Valid subscription request with multiple events', () => {
    expect(
      serializeFhircastSubscriptionRequest({
        mode: 'subscribe',
        channelType: 'websocket',
        topic: 'abc123',
        events: ['Patient-open', 'Patient-close'],
      })
    ).toStrictEqual(
      'hub.channel.type=websocket&hub.mode=subscribe&hub.topic=abc123&hub.events=Patient-open%2CPatient-close'
    );
  });

  test('Valid subscription request with endpoint', () => {
    expect(
      serializeFhircastSubscriptionRequest({
        mode: 'subscribe',
        channelType: 'websocket',
        topic: 'abc123',
        events: ['Patient-open'],
        endpoint: 'wss://abc.com/hub',
      })
    ).toStrictEqual(
      'hub.channel.type=websocket&hub.mode=subscribe&hub.topic=abc123&hub.events=Patient-open&endpoint=wss%3A%2F%2Fabc.com%2Fhub'
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
    const event = 'Patient-open';
    const resourceId = 'patient-123';
    const context = {
      key: 'patient',
      resource: { resourceType: 'Patient', id: resourceId },
    } satisfies FhircastPatientOpenContext;

    const messagePayload = createFhircastMessagePayload(topic, event, context);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': topic, 'hub.event': event, context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toStrictEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toStrictEqual(context);
  });

  test('Valid message with array of contexts', () => {
    const topic = 'abc123';
    const event = 'ImagingStudy-open';
    const resourceId1 = '123';
    const context1 = {
      key: 'patient',
      resource: { resourceType: 'Patient', id: resourceId1 },
    } satisfies FhircastImagingStudyOpenContext;
    const resourceId2 = '456';
    const context2 = {
      key: 'study',
      resource: {
        resourceType: 'ImagingStudy',
        id: resourceId2,
        status: 'available',
        subject: { reference: 'Patient/123' },
      },
    } satisfies FhircastImagingStudyOpenContext;

    const messagePayload = createFhircastMessagePayload(topic, event, [context1, context2]);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': topic, 'hub.event': event, context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toStrictEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toStrictEqual(context1);
    expect(messagePayload.event.context[1]).toStrictEqual(context2);
  });

  test('Valid message with optional context included', () => {
    const topic = 'abc123';
    const event = 'Patient-open';

    const resourceId1 = '123';
    const context1 = {
      key: 'patient',
      resource: { resourceType: 'Patient', id: resourceId1 },
    } satisfies FhircastPatientOpenContext;

    const resourceId2 = '456';
    const context2 = {
      key: 'encounter',
      resource: {
        resourceType: 'Encounter',
        id: resourceId2,
        status: 'in-progress',
        class: { code: 'Test Encounter' },
      },
    } satisfies FhircastPatientOpenContext;

    const messagePayload = createFhircastMessagePayload(topic, event, [context1, context2]);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': topic, 'hub.event': event, context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toStrictEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toStrictEqual(context1);
    expect(messagePayload.event.context[1]).toStrictEqual(context2);
  });

  test('Syncerror', () => {
    expect(
      createFhircastMessagePayload('abc-123', 'syncerror', {
        key: 'operationoutcome',
        resource: {
          resourceType: 'OperationOutcome',
          id: 'patient-123',
          issue: [{ severity: 'error', code: 'processing' }],
        },
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
        'ImagingStudy-open',
        [
          { key: 'patient', resource: { id: '123', resourceType: 'Patient' } },
          {
            key: 'study',
            resource: {
              id: '123',
              resourceType: 'ImagingStudy',
              status: 'available',
              subject: { reference: 'Patient/123' },
            },
          },
        ]
      )
    ).toThrow(OperationOutcomeError);
  });

  test('Invalid event name', () => {
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        // @ts-expect-error Invalid event, must be one of the enumerated FHIRcast events
        'imagingstudy-create',
        [
          {
            key: 'patient',
            resource: { id: '123', resourceType: 'Patient' },
          } satisfies FhircastDiagnosticReportOpenContext,
          {
            key: 'study',
            resource: {
              resourceType: 'ImagingStudy',
              id: '123',
              status: 'available',
              subject: { reference: 'Patient/123' },
            },
          } satisfies FhircastDiagnosticReportOpenContext,
        ]
      )
    ).toThrow(OperationOutcomeError);
  });

  test('Invalid context', () => {
    expect(() =>
      createFhircastMessagePayload(
        // @ts-expect-error Topic must be a string
        12,
        'ImagingStudy-open',
        { key: 'study', resource: { id: 'imagingstudy-123', resourceType: 'ImagingStudy' } }
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'ImagingStudy-open',
        // @ts-expect-error Invalid context, must be an object
        42
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'ImagingStudy-open',
        // @ts-expect-error Invalid context, must be of type FhircastEventContext | FhircastEventContext[]
        { id: 'imagingstudy-123' }
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload('abc-123', 'ImagingStudy-open', {
        key: 'patient',
        resource: { resourceType: 'Patient' },
      })
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'ImagingStudy-open',
        // @ts-expect-error Invalid resource, resourceType required
        { key: 'patient', resource: { id: 'patient-123' } }
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'ImagingStudy-open',
        // @ts-expect-error Invalid resourceType, must be a FHIRcast-related resource
        { key: 'patient', resource: { resourceType: 'Observation', id: 'observation-123' } }
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'ImagingStudy-open',
        // @ts-expect-error Invalid context, must have a valid resource AND a key
        { resource: { resourceType: 'Patient', id: 'patient-123' } }
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'Patient-open',
        // @ts-expect-error Invalid context, must have a valid resource AND a key
        { key: 'subject', resource: { resourceType: 'Patient', id: 'patient-123' } }
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'Patient-open',
        // @ts-expect-error Invalid context, must have a valid resource AND a key
        { key: 'imagingstudy', resource: { resourceType: 'ImagingStudy', id: 'patient-123' } }
      )
    ).toThrow(OperationOutcomeError);
    expect(() =>
      // Should throw because keys must be unique
      createFhircastMessagePayload('abc-123', 'ImagingStudy-open', [
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        {
          key: 'study',
          resource: {
            resourceType: 'ImagingStudy',
            id: 'imagingstudy-456',
            status: 'available',
            subject: { reference: 'Patient/patient-123' },
          },
        },
        {
          key: 'study',
          resource: {
            resourceType: 'ImagingStudy',
            id: 'imagingstudy-789',
            status: 'available',
            subject: { reference: 'Patient/patient-123' },
          },
        },
      ])
    ).toThrow(OperationOutcomeError);
    expect(() =>
      // Should throw because Patient-open has an optional 2nd context of `Encounter`
      createFhircastMessagePayload('abc-123', 'Patient-open', [
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        // @ts-expect-error 'study' is not a valid key on 'Patient-open' event
        { key: 'study', resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-456' } },
      ])
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload('abc-123', 'Patient-open', [
        // @ts-expect-error Key 'patient' expects a 'Patient' resource
        { key: 'patient', resource: { resourceType: 'Bundle', id: 'patient-123' } },
      ])
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload('abc-123', 'Patient-open', [
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        // @ts-expect-error Need a key
        { resource: { resourceType: 'Encounter', id: 'encounter-456' } },
      ])
    ).toThrow(OperationOutcomeError);
    expect(() =>
      createFhircastMessagePayload('abc-123', 'Patient-open', [
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        // @ts-expect-error Resource should be an object
        { key: 'encounter', resource: 42 },
      ])
    ).toThrow(OperationOutcomeError);
  });

  test('Valid `DiagnosticReport-open` event w/ multiple studies', () => {
    const payload = createFhircastMessagePayload('abc-123', 'DiagnosticReport-open', [
      {
        key: 'report',
        resource: { resourceType: 'DiagnosticReport', id: 'report-789', status: 'final', code: { text: 'test' } },
      },
      { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
      {
        key: 'study',
        resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-123', status: 'available', subject: {} },
      },
      {
        key: 'study',
        resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-456', status: 'available', subject: {} },
      },
      {
        key: 'study',
        resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-789', status: 'available', subject: {} },
      },
    ]);
    expect(payload).toEqual<FhircastMessagePayload<'DiagnosticReport-open'>>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': 'abc-123', 'hub.event': 'DiagnosticReport-open', context: expect.any(Object) },
    });
    expect(payload.event.context.length).toStrictEqual(5);
  });

  test('Invalid `DiagnosticReport-open` event w/ multiple reports', () => {
    expect(() =>
      createFhircastMessagePayload('abc-123', 'DiagnosticReport-open', [
        {
          key: 'report',
          resource: { resourceType: 'DiagnosticReport', id: 'report-789', status: 'final', code: { text: 'test' } },
        },
        {
          key: 'report',
          resource: { resourceType: 'DiagnosticReport', id: 'report-789', status: 'final', code: { text: 'test' } },
        },
        { key: 'patient', resource: { resourceType: 'Patient', id: 'patient-123' } },
        {
          key: 'study',
          resource: { resourceType: 'ImagingStudy', id: 'imagingstudy-123', status: 'available', subject: {} },
        },
      ])
    ).toThrow(OperationOutcomeError);
  });

  test('Valid `DiagnosticReport-select` event', () => {
    const messagePayload = createFhircastMessagePayload('abc-123', 'DiagnosticReport-select', [
      {
        key: 'report',
        reference: { reference: 'DiagnosticReport/123' },
      },
      {
        key: 'select',
        reference: { reference: 'Observation/123' },
      },
      {
        key: 'select',
        reference: { reference: 'Observation/456' },
      },
    ]);

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: { 'hub.topic': 'abc-123', 'hub.event': 'DiagnosticReport-select', context: expect.any(Object) },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toStrictEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toBeDefined();
  });

  test('Valid `DiagnosticReport-update` event', () => {
    const messagePayload = createFhircastMessagePayload(
      'abc-123',
      'DiagnosticReport-update',
      [
        {
          key: 'report',
          reference: { reference: 'DiagnosticReport/123' },
        },
        { key: 'updates', resource: { resourceType: 'Bundle', id: 'bundle-123', type: 'transaction' } },
      ],
      generateId()
    );

    expect(messagePayload).toBeDefined();
    expect(messagePayload).toEqual<FhircastMessagePayload>({
      id: expect.any(String),
      timestamp: expect.any(String),
      event: {
        'hub.topic': 'abc-123',
        'hub.event': 'DiagnosticReport-update',
        context: expect.any(Object),
        'context.versionId': expect.any(String),
      },
    });
    expect(new Date(messagePayload.timestamp).toISOString()).toStrictEqual(messagePayload.timestamp);
    expect(messagePayload.event.context[0]).toBeDefined();
  });

  test('Resource context instead of reference for report in `*-update` event', () => {
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        'DiagnosticReport-update',
        [
          // This report should be a reference
          { key: 'report', resource: { resourceType: 'DiagnosticReport', id: 'report-123' } },
          { key: 'updates', resource: { resourceType: 'Bundle', id: 'bundle-123' } },
        ] as FhircastDiagnosticReportUpdateContext[],
        generateId()
      )
    ).toThrow(OperationOutcomeError);
  });

  test('Missing `context.versionId` in `*-update` event', () => {
    expect(() =>
      createFhircastMessagePayload(
        'abc-123',
        // @ts-expect-error Missing `context.versionId` for test
        'DiagnosticReport-update',
        [
          { key: 'report', reference: { reference: 'DiagnosticReport/123' } },
          { key: 'updates', resource: { resourceType: 'Bundle', id: 'bundle-123' } },
        ]
      )
    ).toThrow(OperationOutcomeError);
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
      events: ['Patient-open'],
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

  test('.addEventListener("message") - FhircastMessage', (done) => {
    const message = createFhircastMessagePayload('abc123', 'Patient-open', {
      key: 'patient',
      resource: { id: '123', resourceType: 'Patient' },
    });

    const handler = (event: FhircastMessageEvent): void => {
      expect(event).toBeDefined();
      expect(event.type).toBe('message');
      expect(event.payload).toStrictEqual(message);
      connection.removeEventListener('message', handler);
      done();
    };
    connection.addEventListener('message', handler);
    wsServer.send(message);
  });

  test('.addEventListener("message") - Subscription Confirmation', (done) => {
    const message = createFhircastMessagePayload('abc123', 'Patient-open', {
      key: 'patient',
      resource: { id: '123', resourceType: 'Patient' },
    });

    const handler = (event: FhircastMessageEvent): void => {
      expect(event).toBeDefined();
      expect(event.type).toBe('message');
      expect(event.payload).toStrictEqual(message);
      connection.removeEventListener('message', handler);
      done();
    };
    connection.addEventListener('message', handler);
    wsServer.send({ 'hub.topic': generateId() });
    wsServer.send(message);
  });

  test('.addEventListener("message") - Heartbeat message', (done) => {
    const heartbeatMessage = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      event: {
        'hub.topic': 'abc123',
        'hub.event': 'heartbeat',
        context: [{ key: 'period', decimal: '10' }],
      },
    };

    const message = createFhircastMessagePayload('abc123', 'Patient-open', {
      key: 'patient',
      resource: { id: '123', resourceType: 'Patient' },
    });

    const handler = (event: FhircastMessageEvent): void => {
      expect(event).toBeDefined();
      expect(event.type).toBe('message');
      expect(event.payload).toStrictEqual(message);
      connection.removeEventListener('message', handler);
      done();
    };
    connection.addEventListener('message', handler);
    wsServer.send(heartbeatMessage);
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

  test('Invalid SubscriptionRequest in constructor', () => {
    expect(
      () =>
        new FhircastConnection({
          topic: 'abc123',
          mode: 'subscribe',
          // @ts-expect-error Invalid channelType
          channelType: 'webhooks',
          events: ['Patient-open'],
          endpoint: 'ws://localhost:1234',
        })
    ).toThrow(OperationOutcomeError);
  });
});

describe('isContextVersionRequired', () => {
  test('Version required: true', () => {
    expect(FHIRCAST_EVENT_VERSION_REQUIRED.includes('DiagnosticReport-update')).toStrictEqual(true);
    expect(isContextVersionRequired('DiagnosticReport-update')).toStrictEqual(true);
  });
  test('Version required: false', () => {
    expect((FHIRCAST_EVENT_VERSION_REQUIRED as readonly string[]).includes('Patient-open')).toStrictEqual(false);
    expect(isContextVersionRequired('Patient-open')).toStrictEqual(false);
  });
});

describe('assertContextVersionOptional', () => {
  test('Version optional: true', () => {
    expect((FHIRCAST_EVENT_VERSION_REQUIRED as readonly string[]).includes('Patient-open')).toStrictEqual(false);
    expect(() => assertContextVersionOptional('Patient-open')).not.toThrow();
  });
  test('Version optional: false', () => {
    expect(FHIRCAST_EVENT_VERSION_REQUIRED.includes('DiagnosticReport-update')).toStrictEqual(true);
    expect(() => assertContextVersionOptional('DiagnosticReport-update')).toThrow(OperationOutcomeError);
  });
});
