// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Parameters, Patient } from '@medplum/fhirtypes';
import WS from 'jest-websocket-mock';
import { FetchLike, MedplumClient } from './client';
import { createFakeJwt, mockFetchWithStatus } from './client-test-utils';
import { SubscriptionEmitter, SubscriptionEventMap, SubscriptionManager } from './subscriptions';
import { sendHandshakeBundle } from './subscriptions/test-utils';
import { sleep } from './utils';

const ONE_HOUR = 60 * 60 * 1000;
const MOCK_SUBSCRIPTION_ID = '7b081dd8-a2d2-40dd-9596-58a7305a73b0';

function createMockFetchWithStatus(baseUrl = 'https://api.medplum.com/'): FetchLike {
  return mockFetchWithStatus((url: string, options?: { body: string }) => {
    if (!url.startsWith(baseUrl)) {
      return [400, 'Invalid base URL'];
    }
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    const pathToEval = url.replace(baseUrl, '');
    switch (pathToEval) {
      // createResource<Subscription>
      case '/fhir/R4/Subscription':
        return [
          201,
          {
            ...(options?.body ? JSON.parse(options?.body) : {}),
            id: MOCK_SUBSCRIPTION_ID,
          },
        ];
      // $get-ws-binding-token
      case `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`:
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
      case '/auth/me':
        return [200, { profile: { resourceType: 'Patient', id: '123' } as Patient }];
      default:
        throw new Error('Invalid URL');
    }
  });
}

describe('MedplumClient -- Subscriptions', () => {
  let medplum: MedplumClient;
  let originalWarn: typeof console.warn;
  let wsServer: WS;

  beforeEach(async () => {
    originalWarn = console.warn;
    console.warn = jest.fn();

    wsServer = new WS('wss://api.medplum.com/ws/subscriptions-r4', { jsonProtocol: true });

    medplum = new MedplumClient({
      fetch: createMockFetchWithStatus(),
      accessToken: createFakeJwt({ client_id: '123', login_id: '123' }),
    });
    await medplum.getProfileAsync();
  });

  afterEach(async () => {
    console.warn = originalWarn;
    wsServer.close();
    await wsServer.closed;
    WS.clean();
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

    const connectEventPromise = new Promise<SubscriptionEventMap['connect']>((resolve) => {
      emitter1.addEventListener('connect', (event) => {
        resolve(event);
      });
    });

    const emitter2 = medplum.subscribeToCriteria('Communication');
    expect(emitter2).toBeInstanceOf(SubscriptionEmitter);
    expect(emitter1).toBe(emitter2);

    await expect(wsServer).toReceiveMessage({
      type: 'bind-with-token',
      payload: { token: 'token-123' },
    });
    await sleep(50);
    sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

    const connectEvent = await connectEventPromise;
    expect(connectEvent?.type).toStrictEqual('connect');
    expect(connectEvent?.payload?.subscriptionId).toStrictEqual(MOCK_SUBSCRIPTION_ID);
  });

  test('unsubscribeFromCriteria() -- SubscriptionManager exists', async () => {
    const emitter = medplum.subscribeToCriteria('Communication');

    const connectEventPromise = new Promise<SubscriptionEventMap['connect']>((resolve) => {
      emitter.addEventListener('connect', (event) => {
        resolve(event);
      });
    });

    await expect(wsServer).toReceiveMessage({
      type: 'bind-with-token',
      payload: { token: 'token-123' },
    });
    await sleep(50);
    sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

    const connectEvent = await connectEventPromise;

    expect(connectEvent?.type).toStrictEqual('connect');
    expect(connectEvent?.payload?.subscriptionId).toStrictEqual(MOCK_SUBSCRIPTION_ID);

    const disconnectEvent = await new Promise<SubscriptionEventMap['disconnect']>((resolve) => {
      emitter.addEventListener('disconnect', (event) => {
        resolve(event);
      });
      expect(() => medplum.unsubscribeFromCriteria('Communication')).not.toThrow();
    });
    expect(disconnectEvent?.type).toStrictEqual('disconnect');
    expect(disconnectEvent?.payload?.subscriptionId).toStrictEqual(MOCK_SUBSCRIPTION_ID);

    expect(() => medplum.unsubscribeFromCriteria('Communication')).not.toThrow();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('MedplumClient -- More Subscription Tests', () => {
  let wsServer: WS;

  beforeEach(() => {
    wsServer = new WS('wss://example.com/foo/bar/ws/subscriptions-r4', { jsonProtocol: true });
  });

  afterEach(async () => {
    wsServer.close();
    await wsServer.closed;
  });

  test('should be able to use `baseUrl` w/ a slash path', async () => {
    const medplum = new MedplumClient({
      baseUrl: 'https://example.com/foo/bar/',
      fetch: createMockFetchWithStatus('https://example.com/foo/bar/'),
      accessToken: createFakeJwt({ client_id: '123', login_id: '123' }),
    });
    await medplum.getProfileAsync();

    const emitter = medplum.subscribeToCriteria('Communication');

    const connectEventPromise = new Promise<SubscriptionEventMap['connect']>((resolve) => {
      emitter.addEventListener('connect', (event) => {
        resolve(event);
      });
    });

    await expect(wsServer).toReceiveMessage({
      type: 'bind-with-token',
      payload: { token: 'token-123' },
    });
    await sleep(50);
    sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

    const connectEvent = await connectEventPromise;

    expect(connectEvent?.type).toStrictEqual('connect');
    expect(connectEvent?.payload?.subscriptionId).toStrictEqual(MOCK_SUBSCRIPTION_ID);
  });
});
