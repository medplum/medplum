import {
  IRobustWebSocket,
  MedplumClient,
  RobustWebSocketEventMap,
  SubscriptionEmitter,
  SubscriptionEventMap,
  SubscriptionManager,
  TypedEventTarget,
  deepEquals,
} from '@medplum/core';
import { Subscription } from '@medplum/fhirtypes';

class MockRobustWebSocket extends TypedEventTarget<RobustWebSocketEventMap> implements IRobustWebSocket {
  readyState = WebSocket.OPEN;
  close(): void {
    // Not implemented -- this is a mock
  }
  send(): void {
    // Not implemented -- this is a mock
  }
}

export type MockCriteriaEntry = {
  criteria: string;
  subscriptionProps?: Partial<Subscription>;
  emitter: SubscriptionEmitter;
  count: number;
};

export interface MockSubManagerOptions {
  mockRobustWebSocket?: boolean;
}

export class MockSubscriptionManager extends SubscriptionManager {
  entries: Map<string, MockCriteriaEntry[]>;
  masterEmitter: SubscriptionEmitter;

  constructor(medplum: MedplumClient, _wsUrl: string, options?: MockSubManagerOptions) {
    super(
      medplum,
      'wss://example.com/ws/subscriptions-r4',
      options?.mockRobustWebSocket ? { RobustWebSocket: MockRobustWebSocket } : undefined
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
    this.masterEmitter.dispatchEvent({ type: 'close' });
    for (const emitter of this.getAllMockCriteriaEmitters()) {
      emitter.dispatchEvent({ type: 'close' });
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
  }

  getEmitter(criteria: string, subscriptionProps?: Partial<Subscription>): SubscriptionEmitter | undefined {
    return this.maybeGetMockCriteriaEntry(criteria, subscriptionProps)?.emitter;
  }
}
