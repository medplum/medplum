import { Bundle, Communication, Parameters, Practitioner, Resource, SubscriptionStatus } from '@medplum/fhirtypes';
import WS from 'jest-websocket-mock';
import { SubscriptionEmitter, SubscriptionEventMap, SubscriptionManager } from '.';
import { MedplumClient } from '../client';
import { generateId } from '../crypto';
import { OperationOutcomeError, badRequest } from '../outcomes';
import { ReadablePromise } from '../readablepromise';
import { ProfileResource, createReference, sleep } from '../utils';

const ONE_HOUR = 60 * 60 * 1000;
const MOCK_SUBSCRIPTION_ID = '7b081dd8-a2d2-40dd-9596-58a7305a73b0';

class MockFhirRouter {
  routes: Map<string, () => Record<string, any>>;
  constructor() {
    this.routes = new Map();
  }

  makeKey(method: 'GET' | 'POST', path: string): string {
    return `${method} ${path}`;
  }

  addRoute(method: 'GET' | 'POST', path: string, callback: () => Record<string, any>): void {
    this.routes.set(this.makeKey(method, path), callback);
  }

  fetchRoute<T = Record<string, any>>(method: 'GET' | 'POST', path: string): T {
    const key = this.makeKey(method, path);
    if (!this.routes.has(key)) {
      throw new OperationOutcomeError(badRequest('Invalid route'));
    }
    return (this.routes.get(key) as () => T)();
  }
}

class MockMedplumClient extends MedplumClient {
  router: MockFhirRouter;
  profile: Practitioner;

  constructor() {
    // @ts-expect-error need to pass something for fetch otherwise MedplumClient ctor will complain
    super({ fetch: () => undefined });
    this.router = new MockFhirRouter();
    this.profile = { resourceType: 'Practitioner', id: generateId() } as Practitioner;
  }

  get<T = any>(url: string | URL, _options?: RequestInit): ReadablePromise<T> {
    return new ReadablePromise<T>(
      new Promise<T>((resolve) => {
        resolve(this.router.fetchRoute<T>('GET', url.toString()));
      })
    );
  }

  createResource<T extends Resource>(resource: T, _options?: RequestInit | undefined): Promise<T> {
    return new Promise((resolve) => {
      resolve({ ...resource, id: resource.resourceType === 'Subscription' ? MOCK_SUBSCRIPTION_ID : generateId() } as T);
    });
  }

  getProfile(): ProfileResource | undefined {
    return this.profile;
  }
}

const medplum = new MockMedplumClient();

describe('SubscriptionEmitter', () => {
  test('getCriteria()', () => {
    const kAddCriteria = Symbol.for('medplum.SubscriptionEmitter.addCriteria');
    const kRemoveCriteria = Symbol.for('medplum.SubscriptionEmitter.removeCriteria');

    const emitter = new SubscriptionEmitter();
    expect(emitter.getCriteria().size).toEqual(0);
    // @ts-expect-error Symbol for `addCriteria` is not on public interface
    emitter[kAddCriteria]('Communication');
    expect(emitter.getCriteria().size).toEqual(1);

    // Should be able to add again without changing count
    // @ts-expect-error Symbol for `addCriteria` is not on public interface
    emitter[kAddCriteria]('Communication');
    expect(emitter.getCriteria().size).toEqual(1);

    // @ts-expect-error Symbol for `addCriteria` is not on public interface
    emitter[kAddCriteria]('DiagnosticReport');
    expect(emitter.getCriteria().size).toEqual(2);

    // @ts-expect-error Symbol for `removeCriteria` is not on public interface
    emitter[kRemoveCriteria]('DiagnosticReport');
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

    test('should throw if `wsOrUrl` is not a WebSocket or URL string', async () => {
      // @ts-expect-error Invalid value for `wsOrUrl`
      expect(() => new SubscriptionManager(medplum, undefined)).toThrow(OperationOutcomeError);
      // @ts-expect-error Invalid value for `wsOrUrl`
      expect(() => new SubscriptionManager(medplum, new URL('wss://example.com/ws/subscriptions-r4'))).toThrow(
        OperationOutcomeError
      );
    });

    test('should not throw if `wsOrUrl` is a valid WebSocket', async () => {
      const manager = new SubscriptionManager(medplum, new WebSocket('wss://example.com/ws/subscriptions-r4'));
      expect(manager).toBeDefined();
      await wsServer.connected;
    });

    test('should NOT throw if `wsOrUrl` is a VALID URL string', async () => {
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      expect(manager).toBeDefined();
      await wsServer.connected;
    });

    test('should throw if `wsOrUrl` is an INVALID URL string', () => {
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
        const handler = (event: { type: 'connect'; payload: SubscriptionEventMap['connect']['payload'] }): void => {
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
        const handler = (event: { type: 'message'; payload: SubscriptionEventMap['message']['payload'] }): void => {
          resolve(event.payload);
          emitter.removeEventListener('message', handler);
        };
        emitter.addEventListener('message', handler);

        wsServer.send(sentBundle);
      });
      expect(receivedBundle).toEqual(sentBundle);
    });

    // test('should restore previously created subscriptions instead of creating new ones');
  });

  describe('derefCriteria()', () => {
    let wsServer: WS;
    let manager: SubscriptionManager;
    let emitter: SubscriptionEmitter;

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

    beforeAll(async () => {
      manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      emitter = manager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      const subscriptionId = await new Promise<string>((resolve) => {
        const handler = (event: { type: 'connect'; payload: SubscriptionEventMap['connect']['payload'] }): void => {
          emitter.removeEventListener('connect', handler);
          resolve(event.payload.subscriptionId);
        };
        emitter.addEventListener('connect', handler);
      });

      expect(typeof subscriptionId).toEqual('string');
      await expect(wsServer).toReceiveMessage({ type: 'bind-with-token', payload: { token: 'token-123' } });
    });

    test('should throw when deref has been called on a criteria that is not known', () => {
      expect(() => manager.derefCriteria('DiagnosticReport')).toThrow(OperationOutcomeError);
    });

    test('should not clean up a criteria if there are outstanding listeners', (done) => {
      let success = false;
      const emitter = manager.addCriteria('Communication');
      expect(emitter).toBeInstanceOf(SubscriptionEmitter);

      const handler = (): void => {
        emitter.removeEventListener('disconnect', handler);
        if (!success) {
          done(new Error('Received `disconnect` when not expected'));
        }
      };
      emitter.addEventListener('disconnect', handler);

      manager.derefCriteria('Communication');

      sleep(200)
        .then(() => {
          emitter.removeEventListener('disconnect', handler);
          success = true;
          done();
        })
        .catch(console.error);
    });

    test('should clean up for a criteria if we are the last subscriber', (done) => {
      let success = false;
      const handler = (): void => {
        emitter.removeEventListener('disconnect', handler);
        expect(true).toBeTruthy();
        success = true;
        done();
      };
      emitter.addEventListener('disconnect', handler);

      manager.derefCriteria('Communication');

      sleep(200)
        .then(() => {
          emitter.removeEventListener('disconnect', handler);
          if (!success) {
            done(new Error('Expected to receive `disconnect` message'));
          }
        })
        .catch(console.error);
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
      const manager = new SubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
      await wsServer.connected;

      expect(manager.getCriteriaCount()).toEqual(0);
      manager.addCriteria('Communication');
      expect(manager.getCriteriaCount()).toEqual(1);
      manager.derefCriteria('Communication');
      expect(manager.getCriteriaCount()).toEqual(0);
    });
  });

  afterAll(() => {
    WS.clean();
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
      const ws = new WebSocket('wss://example.com/ws/subscriptions-r4');
      const manager = new SubscriptionManager(medplum, ws);
      await wsServer.connected;

      const event = await new Promise<{ type: 'close' }>((resolve) => {
        manager.getMasterEmitter().addEventListener('close', (event) => {
          resolve(event);
        });
        expect(() => manager.closeWebSocket()).not.toThrow();
        expect(ws.readyState).toBe(WebSocket.CLOSING);
      });
      expect(event?.type).toEqual('close');
    });

    test('should not emit close twice', async () => {
      const ws = new WebSocket('wss://example.com/ws/subscriptions-r4');
      const manager = new SubscriptionManager(medplum, ws);
      await wsServer.connected;

      const event = await new Promise<{ type: 'close' }>((resolve) => {
        manager.getMasterEmitter().addEventListener('close', (event) => {
          resolve(event);
        });
        expect(() => manager.closeWebSocket()).not.toThrow();
        expect(ws.readyState).toBe(WebSocket.CLOSING);
      });
      expect(event?.type).toEqual('close');

      await wsServer.closed;

      await new Promise<void>((resolve, reject) => {
        manager.getMasterEmitter().addEventListener('close', () => {
          reject(new Error('Expected not to call'));
        });
        expect(() => manager.closeWebSocket()).not.toThrow();
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        setTimeout(() => resolve(), 250);
      });
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
  });
});
