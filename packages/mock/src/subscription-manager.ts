// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  deepEquals,
  IReconnectingWebSocket,
  MedplumClient,
  SubscriptionEmitter,
  SubscriptionEventMap,
  SubscriptionManager,
  TypedEventTarget,
  WebSocketEventMap,
} from '@medplum/core';
import { Subscription } from '@medplum/fhirtypes';

export class MockReconnectingWebSocket extends TypedEventTarget<WebSocketEventMap> implements IReconnectingWebSocket {
  readyState: WebSocket['OPEN'] | WebSocket['CLOSED'] = WebSocket.OPEN;
  close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close', { code: code ?? 1000, reason: reason ?? 'unknown reason' }));
  }
  send(): void {
    // Not implemented -- this is a mock
  }
  reconnect(_code?: number, _reason?: string): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }
}

export type MockCriteriaEntry = {
  criteria: string;
  subscriptionProps?: Partial<Subscription>;
  emitter: SubscriptionEmitter;
  count: number;
};

export interface MockSubManagerOptions {
  mockReconnectingWebSocket?: boolean;
}

export class MockSubscriptionManager extends SubscriptionManager {
  entries: Map<string, MockCriteriaEntry[]>;
  masterEmitter: SubscriptionEmitter;

  constructor(medplum: MedplumClient, _wsUrl: string, options?: MockSubManagerOptions) {
    super(
      medplum,
      'wss://example.com/ws/subscriptions-r4',
      options?.mockReconnectingWebSocket ? { ReconnectingWebSocket: MockReconnectingWebSocket } : undefined
    );
    this.entries = new Map<string, MockCriteriaEntry[]>();
    this.masterEmitter = new SubscriptionEmitter();
  }

  private maybeGetMockCriteriaEntry(
    criteria: string,
    subscriptionProps?: Partial<Subscription>
  ): MockCriteriaEntry | undefined {
    const entries = this.entries.get(criteria);
    if (!entries) {
      return undefined;
    }
    return entries.find((entry) => deepEquals(subscriptionProps, entry.subscriptionProps));
  }

  private removeMockCriteriaEntry(criteriaEntry: MockCriteriaEntry): void {
    const entries = this.entries.get(criteriaEntry.criteria);
    if (!entries) {
      console.warn('Called removeMockCriteriaEntry when this criteria is not known to the manager.');
      return;
    }
    const idx = entries.findIndex((entry) => deepEquals(entry.subscriptionProps, criteriaEntry.subscriptionProps));
    if (idx === -1) {
      return;
    }
    entries.splice(idx, 1);
    if (entries.length === 0) {
      this.entries.delete(criteriaEntry.criteria);
    }
  }

  private getAllMockCriteriaEmitters(): SubscriptionEmitter[] {
    const emitters = [];
    for (const entries of this.entries.values()) {
      for (const entry of entries) {
        emitters.push(entry.emitter);
      }
    }
    return emitters;
  }

  addCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): SubscriptionEmitter {
    let entry = this.maybeGetMockCriteriaEntry(criteria, subscriptionProps);
    if (!entry) {
      entry = {
        criteria,
        subscriptionProps,
        emitter: new SubscriptionEmitter(criteria),
        count: 0,
      } satisfies MockCriteriaEntry;
      let entries = this.entries.get(criteria);
      if (!entries) {
        entries = [] as MockCriteriaEntry[];
        this.entries.set(criteria, entries);
      }
      entries.push(entry);
    }
    entry.count += 1;
    return entry.emitter;
  }

  removeCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): void {
    const entry = this.maybeGetMockCriteriaEntry(criteria, subscriptionProps);
    if (!entry) {
      return;
    }
    entry.count -= 1;
    if (entry.count === 0) {
      this.removeMockCriteriaEntry(entry);
    }
  }

  closeWebSocket(): void {
    this.getWebSocket().close();
    this.masterEmitter.dispatchEvent({ type: 'close' });
    for (const emitter of this.getAllMockCriteriaEmitters()) {
      emitter.dispatchEvent({ type: 'close' });
    }
  }

  openWebSocket(): void {
    this.getWebSocket().reconnect();
    this.masterEmitter.dispatchEvent({ type: 'open' });
    for (const emitter of this.getAllMockCriteriaEmitters()) {
      emitter.dispatchEvent({ type: 'open' });
    }
  }

  getCriteriaCount(): number {
    return this.getAllMockCriteriaEmitters().length;
  }

  getMasterEmitter(): SubscriptionEmitter {
    return this.masterEmitter;
  }

  emitEventForCriteria<K extends keyof SubscriptionEventMap = keyof SubscriptionEventMap>(
    criteria: string,
    event: SubscriptionEventMap[K],
    subscriptionProps?: Partial<Subscription>
  ): void {
    this.maybeGetMockCriteriaEntry(criteria, subscriptionProps)?.emitter?.dispatchEvent(event);
    this.masterEmitter.dispatchEvent(event);
  }

  getEmitter(criteria: string, subscriptionProps?: Partial<Subscription>): SubscriptionEmitter | undefined {
    return this.maybeGetMockCriteriaEntry(criteria, subscriptionProps)?.emitter;
  }
}
