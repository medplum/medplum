import { MedplumClient, SubscriptionEmitter, SubscriptionEventMap, SubscriptionManager } from '@medplum/core';

export class MockSubscriptionManager extends SubscriptionManager {
  emitters: Map<string, SubscriptionEmitter>;
  counts: Map<string, number>;
  masterEmitter: SubscriptionEmitter;

  constructor(medplum: MedplumClient, _wsOrUrl: WebSocket | string) {
    super(medplum, 'wss://example.com/ws/subscriptions-r4');
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
