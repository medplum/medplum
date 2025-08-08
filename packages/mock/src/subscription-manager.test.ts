// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SubscriptionEmitter, SubscriptionEventMap, generateId } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { MockClient } from './client';
import { MockReconnectingWebSocket, MockSubscriptionManager } from './subscription-manager';

describe('MockReconnectingWebSocket', () => {
  test('Constructor', () => {
    expect(() => new MockReconnectingWebSocket()).not.toThrow();
  });

  test('.close()', () => {
    const mockWs = new MockReconnectingWebSocket();
    expect(mockWs.readyState).toStrictEqual(WebSocket.OPEN);
    expect(() => mockWs.close()).not.toThrow();
    expect(mockWs.readyState).toStrictEqual(WebSocket.CLOSED);
  });

  test('.reconnect()', () => {
    const mockWs = new MockReconnectingWebSocket();
    expect(mockWs.readyState).toStrictEqual(WebSocket.OPEN);
    expect(() => mockWs.close()).not.toThrow();
    expect(mockWs.readyState).toStrictEqual(WebSocket.CLOSED);
    expect(() => mockWs.reconnect()).not.toThrow();
    expect(mockWs.readyState).toStrictEqual(WebSocket.OPEN);
  });
});

describe('MockSubscriptionManager', () => {
  let medplum: MockClient;
  let manager: MockSubscriptionManager;

  beforeAll(() => {
    medplum = new MockClient();
    manager = new MockSubscriptionManager(medplum, 'wss://example.com/ws/subscriptions-r4');
  });

  test('addCriteria()', () => {
    const emitter1 = manager.addCriteria('Communication');
    expect(emitter1).toBeInstanceOf(SubscriptionEmitter);
    expect(manager.getCriteriaCount()).toStrictEqual(1);

    const emitter2 = manager.addCriteria('Communication');
    expect(emitter2).toBeInstanceOf(SubscriptionEmitter);
    expect(manager.getCriteriaCount()).toStrictEqual(1);

    expect(emitter1).toBe(emitter2);
  });

  test('removeCriteria()', () => {
    manager.removeCriteria('Communication');
    expect(manager.getCriteriaCount()).toStrictEqual(1);
    manager.removeCriteria('Communication');
    expect(manager.getCriteriaCount()).toStrictEqual(0);
    expect(() => manager.removeCriteria('Communucation')).not.toThrow();
    expect(manager.getCriteriaCount()).toStrictEqual(0);
  });

  test('getMasterEmitter()', () => {
    expect(manager.getMasterEmitter()).toBeInstanceOf(SubscriptionEmitter);
  });

  test('emitEventForCriteria()', async () => {
    const emitter = manager.addCriteria('Communication');
    expect(emitter).toBeInstanceOf(SubscriptionEmitter);
    expect(emitter.getCriteria().has('Communication')).toStrictEqual(true);

    const bundleId = generateId();

    const receivedEvent = await new Promise<SubscriptionEventMap['message']>((resolve) => {
      emitter.addEventListener('message', (event) => {
        resolve(event);
      });
      manager.emitEventForCriteria<'message'>('Communication', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: bundleId } as Bundle,
      });
    });

    expect(receivedEvent).toMatchObject({
      type: 'message',
      payload: { resourceType: 'Bundle', id: bundleId },
    } as SubscriptionEventMap['message']);
  });

  test('closeWebSocket()', async () => {
    const receivedEvent = await new Promise<SubscriptionEventMap['close']>((resolve) => {
      manager.getMasterEmitter().addEventListener('close', (event) => {
        resolve(event);
      });
      manager.closeWebSocket();
    });
    expect(receivedEvent?.type).toStrictEqual('close');
  });

  test('openWebSocket()', async () => {
    const receivedEvent = await new Promise<SubscriptionEventMap['open']>((resolve) => {
      manager.getMasterEmitter().addEventListener('open', (event) => {
        resolve(event);
      });
      manager.openWebSocket();
    });
    expect(receivedEvent?.type).toStrictEqual('open');
  });

  test('getEmitter()', async () => {
    expect(manager.getEmitter('Subscription')).toBeUndefined();
    const emitter = manager.addCriteria('Subscription');
    expect(emitter).toBeInstanceOf(SubscriptionEmitter);
    expect(manager.getEmitter('Subscription')).toBe(emitter);
  });
});
