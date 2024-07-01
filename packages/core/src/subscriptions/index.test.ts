import { Bundle, Communication, Parameters, Subscription, SubscriptionStatus } from '@medplum/fhirtypes';
import WS from 'jest-websocket-mock';
import {
  RobustWebSocket,
  SubscriptionEmitter,
  SubscriptionEventMap,
  SubscriptionManager,
  resourceMatchesSubscriptionCriteria,
} from '.';
import { MockMedplumClient } from '../client-test-utils';
import { generateId } from '../crypto';
import { OperationOutcomeError } from '../outcomes';
import { createReference, sleep } from '../utils';

const ONE_HOUR = 60 * 60 * 1000;
const MOCK_SUBSCRIPTION_ID = '7b081dd8-a2d2-40dd-9596-58a7305a73b0';
const SECOND_SUBSCRIPTION_ID = '0474fa07-b98a-4172-b430-5ae234c95222';

const medplum = new MockMedplumClient();
medplum.addNextResourceId(MOCK_SUBSCRIPTION_ID);

describe('RobustWebSocket', () => {
  let wsServer: WS;

  beforeEach(() => {
    wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
  });

  afterEach(() => {
    WS.clean();
  });

  test('.close()', async () => {
    const robustWebSocket = new RobustWebSocket('wss://example.com/ws/subscriptions-r4');
    await wsServer.connected;
    expect(robustWebSocket.readyState).toEqual(WebSocket.OPEN);

    robustWebSocket.close();
    expect(robustWebSocket.readyState).not.toEqual(WebSocket.OPEN);
  });

  test('Getting readyState of underlying WebSocket', async () => {
    const robustWebSocket = new RobustWebSocket('wss://example.com/ws/subscriptions-r4');
    expect(robustWebSocket.readyState).toEqual(WebSocket.CONNECTING);

    await wsServer.connected;
    expect(robustWebSocket.readyState).toEqual(WebSocket.OPEN);

    robustWebSocket.close();
    expect(robustWebSocket.readyState).toEqual(WebSocket.CLOSING);

    await wsServer.closed;
    expect(robustWebSocket.readyState).toEqual(WebSocket.CLOSED);
  });

  test('Sending before WebSocket is connected', async () => {
    const robustWebSocket = new RobustWebSocket('wss://example.com/ws/subscriptions-r4');
    expect(() => robustWebSocket.send(JSON.stringify({ hello: 'medplum' }))).not.toThrow();
    expect(() => robustWebSocket.send(JSON.stringify({ med: 'plum' }))).not.toThrow();

    // Test that open is fired
    await new Promise<void>((resolve) => {
      robustWebSocket.addEventListener('open', () => {
        resolve();
      });
    });

    await expect(wsServer).toReceiveMessage({ hello: 'medplum' });
    await expect(wsServer).toReceiveMessage({ med: 'plum' });
  });

  test('Wait for `open` before sending', async () => {
    const robustWebSocket = new RobustWebSocket('wss://example.com/ws/subscriptions-r4');
    // Test that open is fired
    await new Promise<void>((resolve) => {
      robustWebSocket.addEventListener('open', () => {
        resolve();
      });
    });

    expect(() => robustWebSocket.send(JSON.stringify({ hello: 'medplum' }))).not.toThrow();
    await expect(wsServer).toReceiveMessage({ hello: 'medplum' });
    expect(() => robustWebSocket.send(JSON.stringify({ med: 'plum' }))).not.toThrow();
    await expect(wsServer).toReceiveMessage({ med: 'plum' });
  });

  test('Should emit `message` when message received from WebSocket', async () => {
    const robustWebSocket = new RobustWebSocket('wss://example.com/ws/subscriptions-r4');
    await wsServer.connected;
    const receivedEvent = await new Promise<MessageEvent>((resolve) => {
      robustWebSocket.addEventListener('message', (event) => {
        resolve(event as MessageEvent);
      });
      wsServer.send({ med: 'plum' });
    });
    expect(receivedEvent?.type).toEqual('message');
    expect(receivedEvent?.data).toBeDefined();
    expect(JSON.parse(receivedEvent.data)).toEqual({ med: 'plum' });
  });

  test('Should emit `error` when error received from WebSocket', async () => {
    const robustWebSocket = new RobustWebSocket('wss://example.com/ws/subscriptions-r4');
    await wsServer.connected;
    const receivedEvent = await new Promise<MessageEvent>((resolve) => {
      robustWebSocket.addEventListener('error', (event) => {
        resolve(event as MessageEvent);
      });
      wsServer.error();
    });
    expect(receivedEvent?.type).toEqual('error');
  });

  test('Should emit `close` when server closes connection', async () => {
    const robustWebSocket = new RobustWebSocket('wss://example.com/ws/subscriptions-r4');
    await wsServer.connected;
    const receivedEvent = await new Promise<CloseEvent>((resolve) => {
      robustWebSocket.addEventListener('close', (event) => {
        resolve(event as CloseEvent);
      });
      wsServer.close();
    });
    expect(receivedEvent?.type).toEqual('close');
  });
});

describe('SubscriptionEmitter', () => {
  test('getCriteria()', () => {
    const emitter = new SubscriptionEmitter();
    expect(emitter.getCriteria().size).toEqual(0);
    emitter._addCriteria('Communication');
    expect(emitter.getCriteria().size).toEqual(1);

    // Should be able to add again without changing count
    emitter._addCriteria('Communication');
    expect(emitter.getCriteria().size).toEqual(1);

    emitter._addCriteria('DiagnosticReport');
    expect(emitter.getCriteria().size).toEqual(2);

    emitter._removeCriteria('DiagnosticReport');
    expect(emitter.getCriteria().size).toEqual(1);
  });
});

describe('SubscriptionManager', () => {
  describe('Constructor', () => {
    let wsServer: WS;

    beforeAll(async () => {
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
    });

    afterAll(() => {
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

    beforeAll(() => {
      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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
    });

    afterAll(() => {
      WS.clean();
    });

    test('should add a criteria and receive messages for that criteria', async () => {
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      const emitter = manager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      const subscriptionId = await new Promise<string>((resolve) => {
        const handler = (event: SubscriptionEventMap['connect']): void => {
          emitter.removeEventListener('connect', handler);
          resolve(event.payload.subscriptionId);
        };
        emitter.addEventListener('connect', handler);
      });

      expect(typeof subscriptionId).toEqual('string');
      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });

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
      expect(receivedBundle).toEqual(sentBundle);
    });

    test('should emit `error` when token or url missing from `Subscription/$get-ws-binding-token` operation', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      const manager1 = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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

      expect(masterEvent1?.type).toEqual('error');
      expect(masterEvent1?.payload).toBeInstanceOf(OperationOutcomeError);
      expect(criteriaEvent1?.type).toEqual('error');
      expect(criteriaEvent1?.payload).toBeInstanceOf(OperationOutcomeError);

      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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

      expect(masterEvent2?.type).toEqual('error');
      expect(masterEvent2?.payload).toBeInstanceOf(OperationOutcomeError);
      expect(criteriaEvent2?.type).toEqual('error');
      expect(criteriaEvent2?.payload).toBeInstanceOf(OperationOutcomeError);

      expect(console.error).toHaveBeenCalledTimes(2);
      console.error = originalError;
    });

    test('should track separate `Subscription` resources for same criteria with different `subscriptionProps`', async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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

      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${SECOND_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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

      manager.addCriteria('Communication');
      medplum.addNextResourceId(SECOND_SUBSCRIPTION_ID);
      manager.addCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });

      expect(manager.getCriteriaCount()).toEqual(2);

      manager.removeCriteria('Communication');
      expect(manager.getCriteriaCount()).toEqual(1);

      manager.removeCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });
      expect(manager.getCriteriaCount()).toEqual(0);

      expect(console.warn).toHaveBeenCalledTimes(2);
      console.warn = originalWarn;
      medplum.addNextResourceId(MOCK_SUBSCRIPTION_ID);
    });
  });

  describe('removeCriteria()', () => {
    let wsServer: WS;
    let manager: SubscriptionManager;
    let emitter: SubscriptionEmitter;

    beforeAll(async () => {
      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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

      manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      emitter = manager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      const subscriptionId = await new Promise<string>((resolve) => {
        const handler = (event: SubscriptionEventMap['connect']): void => {
          emitter.removeEventListener('connect', handler);
          resolve(event.payload.subscriptionId);
        };
        emitter.addEventListener('connect', handler);
      });

      expect(typeof subscriptionId).toEqual('string');
      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
    });

    afterAll(() => {
      WS.clean();
    });

    test('should not throw when remove has been called on a criteria that is not known', () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();
      expect(() => manager.removeCriteria('DiagnosticReport')).not.toThrow();
      expect(console.warn).toHaveBeenCalledTimes(1);
      console.warn = originalWarn;
    });

    test('should not clean up a criteria if there are outstanding listeners', async () => {
      let success = false;
      const emitter = manager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      let receivedDisconnect = false;
      const handler = (): void => {
        emitter.removeEventListener('disconnect', handler);
        if (!success) {
          receivedDisconnect = true;
        }
      };
      emitter.addEventListener('disconnect', handler);

      manager.removeCriteria('Communication');

      await sleep(500);
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

      manager.removeCriteria('Communication');

      // Give time for the async tasks to complete before checking for success
      await sleep(200);

      await expect(wsServer).toReceiveMessage({ type: 'unbind-from-token', payload: { token: 'token-123' } });

      emitter.removeEventListener('disconnect', handler);
      if (!success) {
        throw new Error('Expected to receive `disconnect` message');
      }
    });
  });

  describe('getCriteriaCount()', () => {
    let wsServer: WS;

    beforeAll(() => {
      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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
    });

    afterAll(() => {
      WS.clean();
    });

    test('should return the correct amount of criteria', async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      expect(manager.getCriteriaCount()).toEqual(0);
      manager.addCriteria('Communication');
      expect(manager.getCriteriaCount()).toEqual(1);
      manager.addCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });
      expect(manager.getCriteriaCount()).toEqual(2);
      manager.removeCriteria('Communication');
      expect(manager.getCriteriaCount()).toEqual(1);
      manager.removeCriteria('Communication', {
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });
      expect(manager.getCriteriaCount()).toEqual(0);

      expect(console.warn).toHaveBeenCalledTimes(2);
      console.warn = originalWarn;
    });
  });

  describe('closeWebSocket()', () => {
    let wsServer: WS;

    beforeAll(() => {
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
    });

    afterAll(() => {
      WS.clean();
    });

    test('should close websocket and emit `close` when called', async () => {
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      const criteriaEmitter = manager.addCriteria('Communication');

      const [masterEvent, criteriaEvent] = await new Promise<SubscriptionEventMap['close'][]>((resolve, reject) => {
        const promises = [];
        promises.push(
          new Promise<SubscriptionEventMap['close']>((resolve) => {
            manager.getMasterEmitter().addEventListener('close', (event) => {
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

        expect(() => manager.closeWebSocket()).not.toThrow();
        Promise.all(promises).then(resolve).catch(reject);
      });

      await wsServer.closed;
      expect(masterEvent?.type).toEqual('close');
      expect(criteriaEvent?.type).toEqual('close');
    });

    test('should not emit close twice', async () => {
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      const event = await new Promise<SubscriptionEventMap['close']>((resolve) => {
        manager.getMasterEmitter().addEventListener('close', (event) => {
          resolve(event);
        });
        expect(() => manager.closeWebSocket()).not.toThrow();
      });
      expect(event?.type).toEqual('close');

      await wsServer.closed;

      await new Promise<void>((resolve, reject) => {
        manager.getMasterEmitter().addEventListener('close', () => {
          reject(new Error('Expected not to call'));
        });
        expect(() => manager.closeWebSocket()).not.toThrow();
        setTimeout(() => resolve(), 250);
      });

      await wsServer.closed;
    });
  });

  describe('getMasterEmitter()', () => {
    let wsServer: WS;

    beforeAll(async () => {
      wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
    });

    afterAll(() => {
      WS.clean();
    });

    test('should always get the same emitter', async () => {
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;
      expect(manager.getMasterEmitter()).toEqual(manager.getMasterEmitter());
    });
  });

  describe('Scenarios', () => {
    let wsServer: WS;

    beforeAll(() => {
      medplum.router.addRoute('GET', `/fhir/R4/Subscription/${MOCK_SUBSCRIPTION_ID}/$get-ws-binding-token`, () => {
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
    });

    afterAll(() => {
      WS.clean();
    });

    test("should warn when receiving notification for subscription we aren't expecting", async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();

      // @ts-expect-error We don't use manager
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
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
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
        const emitter = manager.getMasterEmitter();
        emitter.addEventListener('heartbeat', (event) => {
          resolve(event.payload);
        });
        wsServer.send(sentBundle);
      });

      expect(receivedBundle).toEqual(sentBundle);
    });

    test('should emit `error` event when error received from WS', async () => {
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      const receivedEvent = await new Promise<SubscriptionEventMap['error']>((resolve) => {
        manager.getMasterEmitter().addEventListener('error', (event) => {
          resolve(event);
        });
        wsServer.error();
      });

      expect(receivedEvent).toMatchObject({ type: 'error', payload: expect.any(Error) });
    });

    test('should emit `error` event when invalid message comes in over WebSocket', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      const wsServer = new WS('wss://example.com/ws/subscriptions-r4');
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      const emitter = manager.addCriteria('Communication');
      const [receivedEvent1, receivedEvent2] = await new Promise<SubscriptionEventMap['error'][]>((resolve, reject) => {
        const promises = [];
        promises.push(
          new Promise<SubscriptionEventMap['error']>((resolve) => {
            manager.getMasterEmitter().addEventListener('error', (event) => {
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

      expect(receivedEvent1?.type).toEqual('error');
      expect(receivedEvent1?.payload).toBeInstanceOf(SyntaxError);
      expect(receivedEvent1?.payload?.message).toMatch(/^Unexpected token/);

      expect(receivedEvent2?.type).toEqual('error');
      expect(receivedEvent2?.payload).toBeInstanceOf(SyntaxError);
      expect(receivedEvent2?.payload?.message).toMatch(/^Unexpected token/);

      expect(console.error).toHaveBeenCalledTimes(1);
      console.error = originalError;
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
