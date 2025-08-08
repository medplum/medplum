// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Bundle, Communication, Parameters, Subscription, SubscriptionStatus } from '@medplum/fhirtypes';
import WS from 'jest-websocket-mock';
import { SubscriptionEmitter, SubscriptionEventMap, SubscriptionManager, resourceMatchesSubscriptionCriteria } from '.';
import { MockMedplumClient } from '../client-test-utils';
import { generateId } from '../crypto';
import { OperationOutcomeError } from '../outcomes';
import { createReference, sleep } from '../utils';
import { ReconnectingWebSocket } from '../websockets/reconnecting-websocket';
import { sendHandshakeBundle, sendSubscriptionMessage } from './test-utils';

const ONE_HOUR = 60 * 60 * 1000;
const MOCK_SUBSCRIPTION_ID = '7b081dd8-a2d2-40dd-9596-58a7305a73b0';
const SECOND_SUBSCRIPTION_ID = '0474fa07-b98a-4172-b430-5ae234c95222';

const medplum = new MockMedplumClient();
medplum.addNextResourceId(MOCK_SUBSCRIPTION_ID);

describe('ReconnectingWebSocket', () => {
  let wsServer: WS;
  let reconnectingWebSocket: ReconnectingWebSocket;

  beforeEach(() => {
    wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
    reconnectingWebSocket = new ReconnectingWebSocket('wss://example.com/ws/subscriptions-r4');
  });

  afterEach(async () => {
    reconnectingWebSocket.close();
    await sleep(0);
    WS.clean();
  });

  test('.close()', async () => {
    await wsServer.connected;
    expect(reconnectingWebSocket.readyState).toStrictEqual(WebSocket.OPEN);

    reconnectingWebSocket.close();
    expect(reconnectingWebSocket.readyState).not.toStrictEqual(WebSocket.OPEN);
  });

  test('Getting readyState of underlying WebSocket', async () => {
    expect(reconnectingWebSocket.readyState).toStrictEqual(WebSocket.CONNECTING);

    await wsServer.connected;
    expect(reconnectingWebSocket.readyState).toStrictEqual(WebSocket.OPEN);

    reconnectingWebSocket.close();
    expect(reconnectingWebSocket.readyState).toStrictEqual(WebSocket.CLOSING);

    await wsServer.closed;
    expect(reconnectingWebSocket.readyState).toStrictEqual(WebSocket.CLOSED);
  });

  test('Sending before WebSocket is connected', async () => {
    expect(() => reconnectingWebSocket.send(JSON.stringify({ hello: 'medplum' }))).not.toThrow();
    expect(() => reconnectingWebSocket.send(JSON.stringify({ med: 'plum' }))).not.toThrow();

    // Test that open is fired
    await new Promise<void>((resolve) => {
      reconnectingWebSocket.addEventListener('open', () => {
        resolve();
      });
    });

    await expect(wsServer).toReceiveMessage({ hello: 'medplum' });
    await expect(wsServer).toReceiveMessage({ med: 'plum' });
  });

  test('Wait for `open` before sending', async () => {
    // Test that open is fired
    await new Promise<void>((resolve) => {
      reconnectingWebSocket.addEventListener('open', () => {
        resolve();
      });
    });

    expect(() => reconnectingWebSocket.send(JSON.stringify({ hello: 'medplum' }))).not.toThrow();
    await expect(wsServer).toReceiveMessage({ hello: 'medplum' });
    expect(() => reconnectingWebSocket.send(JSON.stringify({ med: 'plum' }))).not.toThrow();
    await expect(wsServer).toReceiveMessage({ med: 'plum' });
  });

  test('Should emit `message` when message received from WebSocket', async () => {
    await wsServer.connected;
    const receivedEvent = await new Promise<MessageEvent>((resolve) => {
      reconnectingWebSocket.addEventListener('message', (event) => {
        resolve(event as MessageEvent);
      });
      wsServer.send({ med: 'plum' });
    });
    expect(receivedEvent?.type).toStrictEqual('message');
    expect(receivedEvent?.data).toBeDefined();
    expect(JSON.parse(receivedEvent.data)).toStrictEqual({ med: 'plum' });
  });

  test('Should emit `error` when error received from WebSocket', async () => {
    await wsServer.connected;
    const receivedEvent = await new Promise<ErrorEvent>((resolve) => {
      reconnectingWebSocket.addEventListener('error', (event) => {
        resolve(event as ErrorEvent);
      });
      wsServer.error();
    });
    expect(receivedEvent?.type).toStrictEqual('error');
  });

  test('Should emit `close` when server closes connection', async () => {
    await wsServer.connected;
    const receivedEvent = await new Promise<CloseEvent>((resolve) => {
      reconnectingWebSocket.addEventListener('close', (event) => {
        resolve(event as CloseEvent);
      });
      wsServer.close();
    });
    expect(receivedEvent?.type).toStrictEqual('close');
  });
});

describe('SubscriptionEmitter', () => {
  test('getCriteria()', () => {
    const emitter = new SubscriptionEmitter();
    expect(emitter.getCriteria().size).toStrictEqual(0);
    emitter._addCriteria('Communication');
    expect(emitter.getCriteria().size).toStrictEqual(1);

    // Should be able to add again without changing count
    emitter._addCriteria('Communication');
    expect(emitter.getCriteria().size).toStrictEqual(1);

    emitter._addCriteria('DiagnosticReport');
    expect(emitter.getCriteria().size).toStrictEqual(2);

    emitter._removeCriteria('DiagnosticReport');
    expect(emitter.getCriteria().size).toStrictEqual(1);
  });
});

describe('SubscriptionManager', () => {
  describe('Constructor', () => {
    let wsServer: WS;
    let defaultManager: SubscriptionManager;

    beforeEach(() => {
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
      defaultManager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
    });

    afterEach(async () => {
      defaultManager.closeWebSocket();
      await sleep(0);
      WS.clean();
    });

    test('should throw if not passed a `MedplumClient`', () => {
      // @ts-expect-error Invalid value for `medplum`
      expect(() => new SubscriptionManager(undefined, 'wss://example.com/ws/subscriptions-r4')).toThrow(
        OperationOutcomeError
      );
    });

    test('should throw if `wsUrl` is not a URL or URL string', async () => {
      // @ts-expect-error Invalid value for `wsUrl`
      expect(() => new SubscriptionManager(medplum, undefined)).toThrow(OperationOutcomeError);
      // @ts-expect-error Invalid value for `wsUrl`
      expect(() => new SubscriptionManager(medplum, new WebSocket('wss://example.com/ws/subscriptions-r4'))).toThrow(
        OperationOutcomeError
      );
    });

    test('should NOT throw if `wsUrl` is a VALID URL or URL string', async () => {
      const manager1 = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      expect(manager1).toBeDefined();
      await wsServer.connected;

      const manager2 = new SubscriptionManager(medplum, new URL('wss://example.com/ws/subscriptions-r4'));
      expect(manager2).toBeDefined();
      await wsServer.connected;
    });

    test('should throw if `wsUrl` is an INVALID URL string', () => {
      expect(() => new SubscriptionManager(medplum, 'abc123')).toThrow(OperationOutcomeError);
    });
  });

  describe('addCriteria()', () => {
    let wsServer: WS;
    let defaultManager: SubscriptionManager;

    beforeEach(() => {
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
      defaultManager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
    });

    afterEach(async () => {
      defaultManager.closeWebSocket();
      await sleep(0);
      WS.clean();
    });

    beforeAll(() => {
      medplum.router.addRoute('GET', `fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
        } as Parameters;
      });
    });

    test('should add a criteria and receive messages for that criteria', async () => {
      await wsServer.connected;

      const emitter = defaultManager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      const connectPromise = new Promise<string>((resolve) => {
        const handler = (event: SubscriptionEventMap['connect']): void => {
          emitter.removeEventListener('connect', handler);
          resolve(event.payload.subscriptionId);
        };
        emitter.addEventListener('connect', handler);
      });

      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
      sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

      const subscriptionId = await connectPromise;

      expect(typeof subscriptionId).toStrictEqual('string');

      const timestamp = new Date().toISOString();
      const resource = { resourceType: 'Communication', id: generateId() } as Communication;
      const sentBundle = {
        resourceType: 'Bundle',
        timestamp,
        type: 'history',
        entry: [
          {
            resource: {
              resourceType: 'SubscriptionStatus',
              type: 'event-notification',
              subscription: { reference: `Subscription/${subscriptionId}` },
              notificationEvent: [{ eventNumber: '0', timestamp, focus: createReference(resource) }],
            } as SubscriptionStatus,
          },
          {
            resource,
            fullUrl: `https://example.com/fhir/R4/Communication/${resource.id}`,
          },
        ],
      } as Bundle;

      const receivedBundle = await new Promise<Bundle>((resolve) => {
        const handler = (event: SubscriptionEventMap['message']): void => {
          resolve(event.payload);
          emitter.removeEventListener('message', handler);
        };
        emitter.addEventListener('message', handler);

        wsServer.send(sentBundle);
      });
      expect(receivedBundle).toStrictEqual(sentBundle);
    });

    test('should emit `error` when token or url missing from `Subscription/$get-ws-binding-token` operation', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      const manager1 = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      medplum.router.addRoute('GET', `fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'expiration',
              valueDateTime: new Date(Date.now() + ONE_HOUR).toISOString(),
            },
            {
              name: 'websocket-url',
              valueUrl: 'wss://example.com/ws/subscriptions-r4',
            },
          ],
        } as Parameters;
      });

      const criteriaEmitter1 = manager1.addCriteria('Communication');

      const [masterEvent1, criteriaEvent1] = await new Promise<SubscriptionEventMap['error'][]>((resolve, reject) => {
        const promises = [];
        promises.push(
          new Promise<SubscriptionEventMap['error']>((resolve) => {
            manager1.getMasterEmitter().addEventListener('error', (event) => {
              resolve(event);
            });
          })
        );
        promises.push(
          new Promise<SubscriptionEventMap['error']>((resolve) => {
            criteriaEmitter1.addEventListener('error', (event) => {
              resolve(event);
            });
          })
        );

        Promise.all(promises).then(resolve).catch(reject);
      });

      expect(masterEvent1?.type).toStrictEqual('error');
      expect(masterEvent1?.payload).toBeInstanceOf(OperationOutcomeError);
      expect(criteriaEvent1?.type).toStrictEqual('error');
      expect(criteriaEvent1?.payload).toBeInstanceOf(OperationOutcomeError);

      medplum.router.addRoute('GET', `fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
          ],
        } as Parameters;
      });

      const manager2 = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      const criteriaEmitter2 = manager2.addCriteria('Communication');

      const [masterEvent2, criteriaEvent2] = await new Promise<SubscriptionEventMap['error'][]>((resolve, reject) => {
        const promises = [];
        promises.push(
          new Promise<SubscriptionEventMap['error']>((resolve) => {
            manager2.getMasterEmitter().addEventListener('error', (event) => {
              resolve(event);
            });
          })
        );
        promises.push(
          new Promise<SubscriptionEventMap['error']>((resolve) => {
            criteriaEmitter2.addEventListener('error', (event) => {
              resolve(event);
            });
          })
        );

        Promise.all(promises).then(resolve).catch(reject);
      });

      expect(masterEvent2?.type).toStrictEqual('error');
      expect(masterEvent2?.payload).toBeInstanceOf(OperationOutcomeError);
      expect(criteriaEvent2?.type).toStrictEqual('error');
      expect(criteriaEvent2?.payload).toBeInstanceOf(OperationOutcomeError);

      expect(console.error).toHaveBeenCalledTimes(2);
      console.error = originalError;

      manager1.closeWebSocket();
      manager2.closeWebSocket();
    });

    test('should track separate `Subscription` resources for same criteria with different `subscriptionProps`', async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      await wsServer.connected;

      medplum.router.addRoute('GET', `fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
        } as Parameters;
      });

      medplum.router.addRoute('GET', `fhir/R4/Subscription/${SECOND_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
        } as Parameters;
      });

      defaultManager.addCriteria('Communication');
      medplum.addNextResourceId(SECOND_SUBSCRIPTION_ID);
      defaultManager.addCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });

      expect(defaultManager.getCriteriaCount()).toStrictEqual(2);

      defaultManager.removeCriteria('Communication');
      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);

      defaultManager.removeCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });
      expect(defaultManager.getCriteriaCount()).toStrictEqual(0);

      expect(console.warn).toHaveBeenCalledTimes(2);
      console.warn = originalWarn;
      medplum.addNextResourceId(MOCK_SUBSCRIPTION_ID);
    });
  });

  describe('removeCriteria()', () => {
    let wsServer: WS;
    let emitter: SubscriptionEmitter;
    let defaultManager: SubscriptionManager;

    beforeAll(async () => {
      medplum.router.addRoute('GET', `fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
        } as Parameters;
      });

      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
      defaultManager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');

      await wsServer.connected;

      emitter = defaultManager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      const connectPromise = new Promise<string>((resolve) => {
        const handler = (event: SubscriptionEventMap['connect']): void => {
          emitter.removeEventListener('connect', handler);
          resolve(event.payload.subscriptionId);
        };
        emitter.addEventListener('connect', handler);
      });

      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
      sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

      const subscriptionId = await connectPromise;
      expect(typeof subscriptionId).toStrictEqual('string');
    });

    afterAll(async () => {
      defaultManager.closeWebSocket();
      wsServer.close();
      await wsServer.closed;
      WS.clean();
    });

    test('should not throw when remove has been called on a criteria that is not known', () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();
      expect(() => defaultManager.removeCriteria('DiagnosticReport')).not.toThrow();
      expect(console.warn).toHaveBeenCalledTimes(1);
      console.warn = originalWarn;
    });

    test('should not clean up a criteria if there are outstanding listeners', async () => {
      let success = false;
      const emitter = defaultManager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      let receivedDisconnect = false;
      const handler = (): void => {
        emitter.removeEventListener('disconnect', handler);
        if (!success) {
          receivedDisconnect = true;
        }
      };
      emitter.addEventListener('disconnect', handler);

      defaultManager.removeCriteria('Communication');

      expect(wsServer).not.toHaveReceivedMessages([{ type: 'unbind-from-token', payload: { token: 'token-123' } }]);

      emitter.removeEventListener('disconnect', handler);
      success = true;

      if (receivedDisconnect) {
        throw new Error('Received `disconnect` when not expected');
      }
    });

    test('should clean up for a criteria if we are the last subscriber', async () => {
      let success = false;

      const handler = (): void => {
        emitter.removeEventListener('disconnect', handler);
        expect(true).toBeTruthy();
        success = true;
      };
      emitter.addEventListener('disconnect', handler);

      defaultManager.removeCriteria('Communication');

      await expect(wsServer).toReceiveMessage({ type: 'unbind-from-token', payload: { token: 'token-123' } });

      emitter.removeEventListener('disconnect', handler);
      if (!success) {
        throw new Error('Expected to receive `disconnect` message');
      }
    });
  });

  describe('getCriteriaCount()', () => {
    let wsServer: WS;
    let defaultManager: SubscriptionManager;

    beforeAll(() => {
      medplum.router.addRoute('GET', `fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
        } as Parameters;
      });

      wsServer = new WS('wss://example.com/ws/subscriptions-r4');
      defaultManager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
    });

    afterAll(async () => {
      defaultManager.closeWebSocket();
      wsServer.close();
      await wsServer.closed;
      WS.clean();
    });

    test('should return the correct amount of criteria', async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      await wsServer.connected;

      expect(defaultManager.getCriteriaCount()).toStrictEqual(0);
      defaultManager.addCriteria('Communication');
      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);
      defaultManager.addCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });
      expect(defaultManager.getCriteriaCount()).toStrictEqual(2);
      defaultManager.removeCriteria('Communication');
      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);
      defaultManager.removeCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });
      expect(defaultManager.getCriteriaCount()).toStrictEqual(0);

      expect(console.warn).toHaveBeenCalledTimes(2);
      console.warn = originalWarn;
    });
  });

  describe('closeWebSocket()', () => {
    let wsServer: WS;
    let defaultManager: SubscriptionManager;

    beforeEach(() => {
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
      defaultManager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
    });

    afterEach(async () => {
      defaultManager.closeWebSocket();
      wsServer.close();
      await wsServer.closed;
      WS.clean();
    });

    test('should close websocket and emit `close` when called', async () => {
      await wsServer.connected;

      const criteriaEmitter = defaultManager.addCriteria('Communication');

      const [masterEvent, criteriaEvent] = await new Promise<SubscriptionEventMap['close'][]>((resolve, reject) => {
        const promises = [];
        promises.push(
          new Promise<SubscriptionEventMap['close']>((resolve) => {
            defaultManager.getMasterEmitter().addEventListener('close', (event) => {
              resolve(event);
            });
          })
        );
        promises.push(
          new Promise<SubscriptionEventMap['close']>((resolve) => {
            criteriaEmitter.addEventListener('close', (event) => {
              resolve(event);
            });
          })
        );

        expect(() => defaultManager.closeWebSocket()).not.toThrow();
        Promise.all(promises).then(resolve).catch(reject);
      });

      await wsServer.closed;
      expect(masterEvent?.type).toStrictEqual('close');
      expect(criteriaEvent?.type).toStrictEqual('close');
    });

    test('should not emit close twice', async () => {
      await wsServer.connected;

      const event = await new Promise<SubscriptionEventMap['close']>((resolve) => {
        defaultManager.getMasterEmitter().addEventListener('close', (event) => {
          resolve(event);
        });
        expect(() => defaultManager.closeWebSocket()).not.toThrow();
      });
      expect(event?.type).toStrictEqual('close');

      await wsServer.closed;

      await new Promise<void>((resolve, reject) => {
        defaultManager.getMasterEmitter().addEventListener('close', () => {
          reject(new Error('Expected not to call'));
        });
        expect(() => defaultManager.closeWebSocket()).not.toThrow();
        setTimeout(() => resolve(), 250);
      });

      await wsServer.closed;
    });
  });

  describe('getMasterEmitter()', () => {
    test('should always get the same emitter', async () => {
      const wsServer = new WS('wss://example.com/ws/subscriptions-r4');
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;
      expect(manager.getMasterEmitter()).toStrictEqual(manager.getMasterEmitter());

      wsServer.close();
      await wsServer.closed;
      WS.clean();
    });
  });

  describe('Scenarios', () => {
    let medplum: MockMedplumClient;
    let wsServer: WS;
    let defaultManager: SubscriptionManager;

    beforeEach(() => {
      medplum = new MockMedplumClient();
      medplum.addNextResourceId(MOCK_SUBSCRIPTION_ID);

      medplum.router.addRoute('GET', `fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
        } as Parameters;
      });

      medplum.router.addRoute('GET', `fhir/R4/Subscription/${SECOND_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
        return {
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
        } as Parameters;
      });

      defaultManager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
    });

    afterEach(async () => {
      defaultManager.closeWebSocket();
      wsServer.close();
      await wsServer.closed;
      WS.clean();
    });

    test("should warn when receiving notification for subscription we aren't expecting", async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      // @ts-expect-error We don't use defaultManager
      const _manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      const timestamp = new Date().toISOString();
      const resource = { resourceType: 'Communication', id: generateId() } as Communication;
      const sentBundle = {
        resourceType: 'Bundle',
        timestamp,
        type: 'history',
        entry: [
          {
            resource: {
              resourceType: 'SubscriptionStatus',
              type: 'event-notification',
              subscription: { reference: `Subscription/${MOCK_SUBSCRIPTION_ID}` },
              notificationEvent: [{ eventNumber: '0', timestamp, focus: createReference(resource) }],
            } as SubscriptionStatus,
          },
          {
            resource,
            fullUrl: `https://example.com/fhir/R4/Communication/${resource.id}`,
          },
        ],
      } as Bundle;

      wsServer.send(sentBundle);

      expect(console.warn).toHaveBeenCalled();
      console.warn = originalWarn;
    });

    test('should emit `heartbeat` event when heartbeat received', async () => {
      await wsServer.connected;

      const timestamp = new Date().toISOString();
      const sentBundle = {
        resourceType: 'Bundle',
        timestamp,
        type: 'history',
        entry: [
          {
            resource: {
              resourceType: 'SubscriptionStatus',
              status: 'active',
              type: 'heartbeat',
              subscription: { reference: `Subscription/${MOCK_SUBSCRIPTION_ID}` },
            } as SubscriptionStatus,
          },
        ],
      } as Bundle;

      const receivedBundle = await new Promise<Bundle>((resolve) => {
        const emitter = defaultManager.getMasterEmitter();
        emitter.addEventListener('heartbeat', (event) => {
          resolve(event.payload);
        });
        wsServer.send(sentBundle);
      });

      expect(receivedBundle).toStrictEqual(sentBundle);
    });

    test('should emit `error` event when invalid message comes in over WebSocket', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      await wsServer.connected;

      const emitter = defaultManager.addCriteria('Communication');
      const [receivedEvent1, receivedEvent2] = await new Promise<SubscriptionEventMap['error'][]>((resolve, reject) => {
        const promises = [];
        promises.push(
          new Promise<SubscriptionEventMap['error']>((resolve) => {
            defaultManager.getMasterEmitter().addEventListener('error', (event) => {
              resolve(event);
            });
          })
        );
        promises.push(
          new Promise<SubscriptionEventMap['error']>((resolve) => {
            emitter.addEventListener('error', (event) => {
              resolve(event);
            });
          })
        );

        wsServer.send('invalid_json');
        Promise.all(promises).then(resolve).catch(reject);
      });

      expect(receivedEvent1?.type).toStrictEqual('error');
      expect(receivedEvent1?.payload).toBeInstanceOf(TypeError);
      expect(receivedEvent1?.payload?.message).toMatch(/^Cannot read properties of undefined*/);

      expect(receivedEvent2?.type).toStrictEqual('error');
      expect(receivedEvent2?.payload).toBeInstanceOf(TypeError);
      expect(receivedEvent2?.payload?.message).toMatch(/^Cannot read properties of undefined*/);

      expect(console.error).toHaveBeenCalledTimes(1);
      console.error = originalError;
    });

    test('should reconnect after WebSocket disconnects and receive messages', async () => {
      // TODO: Figure out why we are getting so many warnings around receiving messages for unknown subscriptions
      // This seems to happen only when running the whole test suite
      // In isolation, this console.warn mock reports 0 calls :thinking-face:
      console.warn = jest.fn();

      const receivedEvent1Promise = new Promise<SubscriptionEventMap['open']>((resolve) => {
        defaultManager.getMasterEmitter().addEventListener('open', (event) => {
          resolve(event);
        });
      });

      await wsServer.connected;

      const receivedEvent1 = await receivedEvent1Promise;
      expect(receivedEvent1?.type).toStrictEqual('open');

      const receivedEvent2Promise = new Promise<SubscriptionEventMap['connect']>((resolve) => {
        defaultManager.getMasterEmitter().addEventListener('connect', (event) => {
          resolve(event);
        });
      });

      const emitter = defaultManager.addCriteria('Communication');
      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);

      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
      sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

      const receivedEvent2 = await receivedEvent2Promise;
      expect(receivedEvent2.type).toStrictEqual('connect');

      const receivedEvent3Promise = new Promise<SubscriptionEventMap['message']>((resolve) => {
        emitter.addEventListener('message', (event) => {
          resolve(event);
        });
      });

      await sendSubscriptionMessage(wsServer, medplum, MOCK_SUBSCRIPTION_ID, 'Hello, Medplum!');

      const receivedEvent3 = await receivedEvent3Promise;
      expect(receivedEvent3.type).toStrictEqual('message');

      const receivedEvent4Promise = new Promise<SubscriptionEventMap['close']>((resolve) => {
        emitter.addEventListener('close', (event) => {
          resolve(event);
        });
      });
      wsServer.close();

      const receivedEvent4 = await receivedEvent4Promise;
      expect(receivedEvent4?.type).toStrictEqual('close');

      await wsServer.closed;
      WS.clean();

      // Make sure count is still 1 after closing WebSocket
      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);

      const receivedEvent5Promise = new Promise<SubscriptionEventMap['open']>((resolve) => {
        emitter.addEventListener('open', (event) => {
          resolve(event);
        });
      });

      // Now we we reopen the server, the emitter should emit `open`
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });

      const receivedEvent5 = await receivedEvent5Promise;
      expect(receivedEvent5?.type).toStrictEqual('open');

      await wsServer.connected;

      const receivedEvent6Promise = new Promise<SubscriptionEventMap['connect']>((resolve) => {
        emitter.addEventListener('connect', (event) => {
          resolve(event);
        });
      });

      // Make sure we establish the subscription
      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
      // Give some time to add subscription to list on client
      await sleep(100);
      // Then send a handshake message
      sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

      // Now check connect was emitted
      const receivedEvent6 = await receivedEvent6Promise;
      expect(receivedEvent6.type).toStrictEqual('connect');
      expect(typeof receivedEvent6?.payload?.subscriptionId).toStrictEqual('string');
      expect(receivedEvent6?.payload?.subscriptionId?.length).toBeGreaterThan(0);

      // Make sure we get notifications for subscription events
      const receivedEvent7Promise = new Promise<SubscriptionEventMap['message']>((resolve) => {
        emitter.addEventListener('message', (event) => {
          resolve(event);
        });
      });

      await sendSubscriptionMessage(wsServer, medplum, MOCK_SUBSCRIPTION_ID, 'Hello, again!');
      const receivedEvent7 = await receivedEvent7Promise;
      expect(receivedEvent7.type).toStrictEqual('message');
    }, 30000);

    test('should emit close when pong not received from server within time limit', async () => {
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4', {
        pingIntervalMs: 500,
      });
      const receivedEvent1Promise = new Promise<SubscriptionEventMap['open']>((resolve) => {
        manager.getMasterEmitter().addEventListener('open', (event) => {
          resolve(event);
        });
      });

      await wsServer.connected;

      const receivedEvent1 = await receivedEvent1Promise;
      expect(receivedEvent1?.type).toStrictEqual('open');

      // Wait for ping to be received
      await expect(wsServer).toReceiveMessage({ type: 'ping' });

      const receivedEvent3Promise = new Promise<SubscriptionEventMap['close']>((resolve) => {
        manager.getMasterEmitter().addEventListener('close', (event) => {
          resolve(event);
        });
      });

      const closeEvent = await receivedEvent3Promise;
      expect(closeEvent.type).toStrictEqual('close');
    });

    test('should NOT emit close if server responds with pong', async () => {
      wsServer.on('connection', (socket) => {
        socket.on('message', (msg) => {
          const data = JSON.parse(msg as string) as { type?: string };
          if (data?.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
          }
        });
      });

      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4', {
        pingIntervalMs: 500,
      });
      const receivedEvent1Promise = new Promise<SubscriptionEventMap['open']>((resolve) => {
        manager.getMasterEmitter().addEventListener('open', (event) => {
          resolve(event);
        });
      });

      await wsServer.connected;

      const receivedEvent1 = await receivedEvent1Promise;
      expect(receivedEvent1?.type).toStrictEqual('open');

      // Wait for ping to be received
      await expect(wsServer).toReceiveMessage({ type: 'ping' });

      let receivedClose = false;
      manager.getMasterEmitter().addEventListener('close', () => {
        receivedClose = true;
      });

      // Then wait for potential close
      await sleep(1500);

      expect(receivedClose).toStrictEqual(false);
    });

    test('should reconnect WebSocket and refresh subscriptions when profile changes', async () => {
      const receivedEvent1Promise = new Promise<SubscriptionEventMap['open']>((resolve) => {
        defaultManager.getMasterEmitter().addEventListener('open', (event) => {
          resolve(event);
        });
      });

      await wsServer.connected;

      const receivedEvent1 = await receivedEvent1Promise;
      expect(receivedEvent1?.type).toStrictEqual('open');

      const receivedEvent2Promise = new Promise<SubscriptionEventMap['connect']>((resolve) => {
        defaultManager.getMasterEmitter().addEventListener('connect', (event) => {
          resolve(event);
        });
      });

      const emitter1 = defaultManager.addCriteria('Communication');
      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);

      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
      sendHandshakeBundle(wsServer, MOCK_SUBSCRIPTION_ID);

      const receivedEvent2 = await receivedEvent2Promise;
      expect(receivedEvent2.type).toStrictEqual('connect');

      const receivedEvent3Promise = new Promise<SubscriptionEventMap['message']>((resolve) => {
        emitter1.addEventListener('message', (event) => {
          resolve(event);
        });
      });

      await sendSubscriptionMessage(wsServer, medplum, MOCK_SUBSCRIPTION_ID, 'Hello, Medplum!');

      const receivedEvent3 = await receivedEvent3Promise;
      expect(receivedEvent3.type).toStrictEqual('message');

      const receivedEvent4Promise = new Promise<SubscriptionEventMap['close']>((resolve) => {
        emitter1.addEventListener('close', (event) => {
          resolve(event);
        });
      });

      medplum.setProfile(undefined);

      const receivedEvent4 = await receivedEvent4Promise;
      expect(receivedEvent4.type).toStrictEqual('close');

      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);

      await wsServer.closed;
      WS.clean();

      const receivedEvent5Promise = new Promise<SubscriptionEventMap['open']>((resolve) => {
        emitter1.addEventListener('open', (event) => {
          resolve(event);
        });
      });

      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });

      medplum.addNextResourceId(SECOND_SUBSCRIPTION_ID);

      // Set profile to a new profile
      medplum.setProfile({ resourceType: 'Practitioner', id: generateId() });

      const receivedEvent5 = await receivedEvent5Promise;
      expect(receivedEvent5.type).toStrictEqual('open');

      const receivedEvent6Promise = new Promise<SubscriptionEventMap['connect']>((resolve) => {
        defaultManager.getMasterEmitter().addEventListener('connect', (event) => {
          resolve(event);
        });
      });

      const emitter2 = defaultManager.addCriteria('Communication');
      expect(defaultManager.getCriteriaCount()).toStrictEqual(1);

      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
      await sleep(100);
      sendHandshakeBundle(wsServer, SECOND_SUBSCRIPTION_ID);

      const receivedEvent6 = await receivedEvent6Promise;
      expect(receivedEvent6.type).toStrictEqual('connect');

      const receivedEvent7Promise = new Promise<SubscriptionEventMap['message']>((resolve) => {
        emitter2.addEventListener('message', (event) => {
          resolve(event);
        });
      });

      await sendSubscriptionMessage(wsServer, medplum, SECOND_SUBSCRIPTION_ID, 'Hello, Medplum!');

      const receivedEvent7 = await receivedEvent7Promise;
      expect(receivedEvent7.type).toStrictEqual('message');
    });
  });
});

describe('resourceMatchesSubscriptionCriteria', () => {
  it('should return true for a resource that matches the criteria', async () => {
    const subscription: Subscription = {
      resourceType: 'Subscription',
      status: 'active',
      reason: 'test subscription',
      criteria: 'Communication',
      channel: {
        type: 'rest-hook',
        endpoint: 'Bot/123',
      },
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
          valueString: '%previous.status = "in-progress" and %current.status = "completed"',
        },
        {
          url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
          valueCode: 'update',
        },
      ],
    };

    const result1 = await resourceMatchesSubscriptionCriteria({
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
      },
      subscription,
      context: { interaction: 'create' },
      getPreviousResource: async () => undefined,
    });
    expect(result1).toBe(false);

    const result2 = await resourceMatchesSubscriptionCriteria({
      resource: {
        resourceType: 'Communication',
        status: 'completed',
      },
      subscription,
      context: { interaction: 'update' },
      getPreviousResource: async () => ({
        resourceType: 'Communication',
        status: 'in-progress',
      }),
    });
    expect(result2).toBe(true);
  });
});
