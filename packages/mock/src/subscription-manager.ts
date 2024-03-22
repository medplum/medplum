import {
  IRobustWebSocket,
  MedplumClient,
  RobustWebSocketEventMap,
  SubscriptionEmitter,
  SubscriptionEventMap,
  SubscriptionManager,
  TypedEventTarget,
} from '@medplum/core';

class MockRobustWebSocket extends TypedEventTarget<RobustWebSocketEventMap> implements IRobustWebSocket {
  readyState = WebSocket.OPEN;
  close(): void {
    // Not implemented -- this is a mock
  }
  send(): void {
    // Not implemented -- this is a mock
  }
}

export interface MockSubManagerOptions {
  mockRobustWebSocket?: boolean;
}

export class MockSubscriptionManager extends SubscriptionManager {
  emitters: Map<string, SubscriptionEmitter>;
  counts: Map<string, number>;
  masterEmitter: SubscriptionEmitter;

  constructor(medplum: MedplumClient, _wsUrl: string, options?: MockSubManagerOptions) {
    super(
      medplum,
      'wss://example.com/ws/subscriptions-r4',
      options?.mockRobustWebSocket ? { RobustWebSocket: MockRobustWebSocket } : undefined
    );
    this.emitters = new Map<string, SubscriptionEmitter>();
    this.counts = new Map<string, number>();
    this.masterEmitter = new SubscriptionEmitter();
  }

  addCriteria(criteria: string): SubscriptionEmitter {
    if (!this.emitters.has(criteria)) {
      this.emitters.set(criteria, new SubscriptionEmitter(criteria));
    }
    this.counts.set(criteria, (this.counts.get(criteria) ?? 0) + 1);
    return this.emitters.get(criteria) as SubscriptionEmitter;
  }

  removeCriteria(criteria: string): void {
    if (!this.emitters.has(criteria)) {
      return;
    }
    this.counts.set(criteria, (this.counts.get(criteria) as number) - 1);
    if (this.counts.get(criteria) === 0) {
      this.emitters.delete(criteria);
      this.counts.delete(criteria);
    }
  }

  closeWebSocket(): void {
    this.masterEmitter.dispatchEvent({ type: 'close' });
    for (const emitter of this.emitters.values()) {
      emitter.dispatchEvent({ type: 'close' });
    }
  }

  getCriteriaCount(): number {
    return this.emitters.size;
  }

  getMasterEmitter(): SubscriptionEmitter {
    return this.masterEmitter;
  }

  emitEventForCriteria<K extends keyof SubscriptionEventMap = keyof SubscriptionEventMap>(
    criteria: string,
    event: SubscriptionEventMap[K]
  ): void {
    this.emitters.get(criteria)?.dispatchEvent(event);
  }

  getEmitter(criteria: string): SubscriptionEmitter | undefined {
    return this.emitters.get(criteria);
  }
}
