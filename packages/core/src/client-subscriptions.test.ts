import { Parameters, Patient } from '@medplum/fhirtypes';
import WS from 'jest-websocket-mock';
import { MedplumClient } from './client';
import { createFakeJwt, mockFetchWithStatus } from './client-test-utils';
import { SubscriptionEmitter, SubscriptionEventMap, SubscriptionManager } from './subscriptions';

const ONE_HOUR = 60 * 60 * 1000;
const MOCK_SUBSCRIPTION_ID = '7b081dd8-a2d2-40dd-9596-58a7305a73b0';

const fetch = mockFetchWithStatus((url: string, options?: { body: string }) => {
  switch (url) {
    // createResource<Subscription>
    case 'https://api.medplum.com/fhir/R4/Subscription':
      return [
        201,
        {
          ...(options?.body ? JSON.parse(options?.body) : {}),
          id: MOCK_SUBSCRIPTION_ID,
        },
      ] as [number, string];
    // $get-ws-binding-token
    case `https://api.medplum.com/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`:
      return [
        200,
        {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'token',
              valueString: 'token-123',
            },
            {
              name: 'expiration',
              valueDateTime: new Date(Date.now() + ONE_HOUR).toISOString(),
            },
            {
              name: 'websocket-url',
              valueUrl: 'wss://example.com/ws/subscriptions-r4',
            },
          ],
        } as Parameters,
      ];
    // Get profile
    case 'https://api.medplum.com/auth/me':
      return [200, { profile: { resourceType: 'Patient', id: '123' } as Patient }];
    default:
      throw new Error('Invalid URL');
  }
});

describe('MedplumClient -- Subscriptions', () => {
  let medplum: MedplumClient;
  let warnMockFn: jest.Mock;
  let originalWarn: typeof console.warn;

  beforeAll(async () => {
    originalWarn = console.warn;
    console.warn = warnMockFn = jest.fn();
    jest.useFakeTimers();

    // @ts-expect-error Need this to be here even if we are not using it so that WS reqs don't fail
    const _wsServer = new WS('wss://api.medplum.com/ws/subscriptions-r4', { jsonProtocol: true });
  });

  afterAll(async () => {
    console.warn = originalWarn;
    jest.useRealTimers();
  });

  beforeEach(async () => {
    warnMockFn.mockClear();
    medplum = new MedplumClient({ fetch, accessToken: createFakeJwt({ client_id: '123', login_id: '123' }) });
    await medplum.getProfileAsync();
  });

  // This should be a no-op
  test('unsubscribeFromCriteria() -- no SubscriptionManager', async () => {
    expect(() => medplum.unsubscribeFromCriteria('Communication')).not.toThrow();
  });

  test('getSubscriptionManager()', () => {
    expect(medplum.getSubscriptionManager()).toBeInstanceOf(SubscriptionManager);
  });

  test('getMasterSubscriptionEmitter()', () => {
    expect(medplum.getMasterSubscriptionEmitter()).toBeInstanceOf(SubscriptionEmitter);
  });

  test('subscribeToCriteria()', async () => {
    const emitter1 = medplum.subscribeToCriteria('Communication');
    expect(emitter1).toBeInstanceOf(SubscriptionEmitter);

    const emitter2 = medplum.subscribeToCriteria('Communication');
    expect(emitter2).toBeInstanceOf(SubscriptionEmitter);
    expect(emitter1).toBe(emitter2);

    const connectEvent = await new Promise<SubscriptionEventMap['connect']>((resolve) => {
      emitter1.addEventListener('connect', (event) => {
        resolve(event);
      });
    });
    expect(connectEvent?.type).toEqual('connect');
    expect(connectEvent?.payload?.subscriptionId).toEqual(MOCK_SUBSCRIPTION_ID);
  });

  test('unsubscribeFromCriteria() -- SubscriptionManager exists', async () => {
    const emitter = medplum.subscribeToCriteria('Communication');

    const connectEvent = await new Promise<SubscriptionEventMap['connect']>((resolve) => {
      emitter.addEventListener('connect', (event) => {
        resolve(event);
      });
    });
    expect(connectEvent?.type).toEqual('connect');
    expect(connectEvent?.payload?.subscriptionId).toEqual(MOCK_SUBSCRIPTION_ID);

    const disconnectEvent = await new Promise<SubscriptionEventMap['disconnect']>((resolve) => {
      emitter.addEventListener('disconnect', (event) => {
        resolve(event);
      });
      expect(() => medplum.unsubscribeFromCriteria('Communication')).not.toThrow();
    });
    expect(disconnectEvent?.type).toEqual('disconnect');
    expect(disconnectEvent?.payload?.subscriptionId).toEqual(MOCK_SUBSCRIPTION_ID);

    expect(() => medplum.unsubscribeFromCriteria('Communication')).not.toThrow();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
