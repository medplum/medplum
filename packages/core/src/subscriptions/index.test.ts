import { Bundle, Communication, Parameters, SubscriptionStatus } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import WS from 'jest-websocket-mock';
import { SubscriptionEmitter, SubscriptionEventMap, SubscriptionManager } from '.';
import { MedplumClient } from '../client';
import { generateId } from '../crypto';
import { allOk } from '../outcomes';
import { createReference } from '../utils';

const ONE_HOUR = 60 * 60 * 1000;
const medplum = new MockClient();

describe('SubscriptionManager', () => {
  let wsServer: WS;

  beforeAll(async () => {
    // console.log = jest.fn();
    medplum.router.router.add('GET', 'Subscription/:id/$get-ws-binding-token', async () => {
      return [
        allOk,
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
    });
    wsServer = new WS('wss://example.com/ws/subscriptions-r4', { jsonProtocol: true });
  });

  afterAll(() => {
    WS.clean();
  });

  describe('addCriteria()', () => {
    test('Should add a criteria and receive messages for that criteria', async () => {
      const manager = new SubscriptionManager(
        medplum as unknown as MedplumClient,
        'wss://example.com/ws/subscriptions-r4'
      );

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
  });
});
