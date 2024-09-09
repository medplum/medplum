import WS from 'jest-websocket-mock';
import { MedplumClient } from './client';
import { mockFetch } from './client-test-utils';
import { ContentType } from './contenttype';
import { generateId } from './crypto';
import {
  CurrentContext,
  FhircastConnection,
  FhircastEventName,
  PendingSubscriptionRequest,
  SubscriptionRequest,
  serializeFhircastSubscriptionRequest,
} from './fhircast';
import { createFhircastMessageContext } from './fhircast/test-utils';
import { OperationOutcomeError } from './outcomes';

describe('FHIRcast', () => {
  describe('fhircastSubscribe', () => {
    test('Valid subscription request', async () => {
      const fetch = mockFetch(200, { 'hub.channel.endpoint': 'wss://api.medplum.com/ws/fhircast/def456' });
      const client = new MedplumClient({ fetch });

      const topic = 'abc123';
      const events = ['Patient-open'] as FhircastEventName[];
      const expectedSubRequest = {
        mode: 'subscribe',
        channelType: 'websocket',
        topic,
        events,
      } satisfies PendingSubscriptionRequest;
      const serializedSubRequest = serializeFhircastSubscriptionRequest(expectedSubRequest);

      const subRequest = await client.fhircastSubscribe(topic, events);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.medplum.com/fhircast/STU3',
        expect.objectContaining<RequestInit>({
          method: 'POST',
          body: serializedSubRequest,
          headers: expect.objectContaining({ 'Content-Type': ContentType.FORM_URL_ENCODED }),
        })
      );
      expect(subRequest).toEqual(expect.objectContaining<PendingSubscriptionRequest>(expectedSubRequest));
      expect(subRequest.endpoint).toBeDefined();
      expect(subRequest.endpoint?.startsWith('ws')).toBeTruthy();
    });

    test('Invalid subscription request', async () => {
      const fetch = mockFetch(500, { error: 'how did we make it here?' });
      const client = new MedplumClient({ fetch });

      await expect(client.fhircastSubscribe('', ['Patient-open'])).rejects.toBeInstanceOf(OperationOutcomeError);
      // @ts-expect-error Topic must be a string
      await expect(client.fhircastSubscribe(123, ['Patient-open'])).rejects.toBeInstanceOf(OperationOutcomeError);
      // @ts-expect-error Events must be an array of events
      await expect(client.fhircastSubscribe('abc123', 'Patient-open')).rejects.toBeInstanceOf(OperationOutcomeError);
      // @ts-expect-error Events must be an array of valid events
      await expect(client.fhircastSubscribe('abc123', ['random-event'])).rejects.toBeInstanceOf(OperationOutcomeError);
    });

    test('Server returns invalid response', async () => {
      const fetch = mockFetch(500, { error: 'how did we make it here?' });
      const client = new MedplumClient({ fetch });

      await expect(client.fhircastSubscribe('abc123', ['Patient-open'])).rejects.toBeInstanceOf(Error);
    });
  });

  describe('fhircastUnsubscribe', () => {
    test('Valid unsubscription request', async () => {
      const fetch = mockFetch(201, { response: 'Hello from Medplum!' });
      const client = new MedplumClient({ fetch });

      const subRequest = {
        mode: 'subscribe', // you should be able to pass a sub request with mode still set to `subscribe`
        channelType: 'websocket',
        topic: 'abc123',
        events: ['Patient-open'],
        endpoint: 'wss://api.medplum.com/ws/fhircast/def456',
      } satisfies SubscriptionRequest;
      const serializedSubRequest = serializeFhircastSubscriptionRequest({ ...subRequest, mode: 'unsubscribe' });

      await client.fhircastUnsubscribe(subRequest);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.medplum.com/fhircast/STU3',
        expect.objectContaining<RequestInit>({
          method: 'POST',
          body: serializedSubRequest,
          headers: expect.objectContaining({ 'Content-Type': ContentType.FORM_URL_ENCODED }),
        })
      );
    });

    test('Invalid unsubscription request', async () => {
      const fetch = mockFetch(500, { error: 'How did we get here?' });
      const client = new MedplumClient({ fetch });

      await expect(
        // @ts-expect-error Sub request requires mode
        client.fhircastUnsubscribe({
          channelType: 'websocket',
          topic: 'abc123',
          events: ['Patient-open'],
          endpoint: 'wss://api.medplum.com/ws/fhircast/def456',
        })
      ).rejects.toBeInstanceOf(OperationOutcomeError);
      await expect(
        // @ts-expect-error Sub request requires channelType
        client.fhircastUnsubscribe({
          mode: 'subscribe',
          topic: 'abc123',
          events: ['Patient-open'],
          endpoint: 'wss://api.medplum.com/ws/fhircast/def456',
        })
      ).rejects.toBeInstanceOf(OperationOutcomeError);
      await expect(
        // @ts-expect-error This is a valid SubscriptionRequest but it lacks an endpoint
        client.fhircastUnsubscribe({
          channelType: 'websocket',
          mode: 'subscribe',
          topic: 'abc123',
          events: ['Patient-open'],
        })
      ).rejects.toBeInstanceOf(OperationOutcomeError);
    });
  });

  describe('fhircastConnect', () => {
    let client: MedplumClient;

    beforeAll(() => {
      const fetch = mockFetch(500, { error: 'How did we get here?' });
      // @ts-expect-error not used directly but needed for mocking WS
      const _wsServer = new WS('wss://api.medplum.com/ws/fhircast/abc123', { jsonProtocol: true });
      client = new MedplumClient({ fetch });
    });

    afterAll(() => {
      WS.clean();
    });

    test('Valid subscription request', async () => {
      const connection = client.fhircastConnect({
        channelType: 'websocket',
        mode: 'subscribe',
        topic: 'abc123',
        events: ['Patient-open'],
        endpoint: 'wss://api.medplum.com/ws/fhircast/abc123',
      });
      expect(connection).toBeInstanceOf(FhircastConnection);
    });

    test('Invalid subscription request', () => {
      expect(() =>
        // @ts-expect-error Invalid subscription request, requires endpoint
        client.fhircastConnect({
          channelType: 'websocket',
          mode: 'subscribe',
          topic: 'abc123',
          events: ['Patient-open'],
        })
      ).toThrow(OperationOutcomeError);
    });
  });

  describe('fhircastPublish', () => {
    test('Valid context published', async () => {
      const context = createFhircastMessageContext<'Patient-open'>('patient', 'Patient', 'patient-123');
      const fetch = mockFetch(201, { success: true, event: context });
      const client = new MedplumClient({ fetch });
      await expect(client.fhircastPublish('abc123', 'Patient-open', context)).resolves.toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.medplum.com/fhircast/STU3/abc123',
        expect.objectContaining<RequestInit>({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': ContentType.JSON }),
          body: expect.any(String),
        })
      );

      // Multiple contexts
      await expect(
        client.fhircastPublish('def456', 'ImagingStudy-open', [
          createFhircastMessageContext<'ImagingStudy-open'>('patient', 'Patient', 'patient-123'),
          createFhircastMessageContext<'ImagingStudy-open'>('study', 'ImagingStudy', 'imagingstudy-456'),
        ])
      ).resolves.toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.medplum.com/fhircast/STU3/def456',
        expect.objectContaining<RequestInit>({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': ContentType.JSON }),
          body: expect.any(String),
        })
      );

      // 'DiagnosticReport-open' requires both a report and a patient
      await expect(
        client.fhircastPublish('xyz-789', 'DiagnosticReport-open', [
          createFhircastMessageContext<'DiagnosticReport-open'>('report', 'DiagnosticReport', 'report-987'),
          createFhircastMessageContext<'DiagnosticReport-open'>('patient', 'Patient', 'patient-123'),
        ])
      ).resolves.toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.medplum.com/fhircast/STU3/xyz-789',
        expect.objectContaining<RequestInit>({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': ContentType.JSON }),
          body: expect.any(String),
        })
      );
    });

    test('Invalid context published', async () => {
      const fetch = mockFetch(500, { error: 'How did we make it here?' });
      const client = new MedplumClient({ fetch });
      await expect(
        // Topic needs to be a string with a length
        client.fhircastPublish(
          '',
          'Patient-open',
          createFhircastMessageContext<'Patient-open'>('patient', 'Patient', 'patient-123')
        )
      ).rejects.toBeInstanceOf(OperationOutcomeError);
      await expect(
        // @ts-expect-error Invalid context object
        client.fhircastPublish('abc123', 'Patient-open', {})
      ).rejects.toBeInstanceOf(OperationOutcomeError);
      await expect(
        client.fhircastPublish(
          'abc123',
          // @ts-expect-error Invalid event
          'random-event',
          createFhircastMessageContext<'Patient-open'>('patient', 'Patient', 'patient-123')
        )
      ).rejects.toBeInstanceOf(OperationOutcomeError);

      // 'DiagnosticReport-open' requires both a report and a patient
      await expect(
        client.fhircastPublish(
          'xyz-789',
          'DiagnosticReport-open',
          createFhircastMessageContext<'DiagnosticReport-open'>('report', 'DiagnosticReport', 'report-987')
        )
      ).rejects.toBeInstanceOf(OperationOutcomeError);
    });
  });

  describe('fhircastGetContext', () => {
    let client: MedplumClient;
    let topic: string;
    let topicContext: CurrentContext<'DiagnosticReport-open'>;

    beforeAll(() => {
      topic = generateId();
      topicContext = {
        'context.type': 'DiagnosticReport',
        'context.versionId': generateId(),
        context: [createFhircastMessageContext<'DiagnosticReport-open'>('report', 'DiagnosticReport', generateId())],
      };
      const fetch = mockFetch(200, (url: string) => {
        if (url.endsWith(`/${topic}`)) {
          return topicContext;
        } else {
          return { 'context.type': '', context: [] };
        }
      });
      client = new MedplumClient({ fetch });
    });

    test('Get context for topic with context', async () => {
      await expect(client.fhircastGetContext(topic)).resolves.toEqual(topicContext);
    });

    test('Get context for topic without context', async () => {
      await expect(client.fhircastGetContext('abc-123')).resolves.toEqual({ 'context.type': '', context: [] });
    });
  });
});
