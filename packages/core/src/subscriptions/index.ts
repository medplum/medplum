import { Bundle, Parameters, Subscription, SubscriptionStatus } from '@medplum/fhirtypes';
import { MedplumClient } from '../client';
import { TypedEventTarget } from '../eventtarget';
import { OperationOutcomeError, badRequest, serverError, validationError } from '../outcomes';
import { ProfileResource, getReferenceString, resolveId } from '../utils';

export type SubscriptionEventMap = {
  connect: { type: 'connect'; payload: { subscriptionId: string } };
  disconnect: { type: 'disconnect'; payload: { subscriptionId: string } };
  error: { type: 'error'; payload: Error };
  message: { type: 'message'; payload: Bundle };
  close: { type: 'close' };
  heartbeat: { type: 'heartbeat'; payload: Bundle };
};

const kAddCriteria = Symbol.for('medplum.SubscriptionEmitter.addCriteria');
const kRemoveCriteria = Symbol.for('medplum.SubscriptionEmitter.removeCriteria');

/**
 * An `EventTarget` that emits events when new subscription notifications come in over WebSockets.
 */
export class SubscriptionEmitter extends TypedEventTarget<SubscriptionEventMap> {
  private criteria: Set<string>;
  constructor(...criteria: string[]) {
    super();
    this.criteria = new Set(criteria);
  }
  getCriteria(): Set<string> {
    return this.criteria;
  }
  [kAddCriteria](criteria: string): void {
    this.criteria.add(criteria);
  }
  [kRemoveCriteria](criteria: string): void {
    this.criteria.delete(criteria);
  }
}

export class SubscriptionManager {
  private readonly medplum: MedplumClient;
  private ws: WebSocket;
  private masterSubEmitter?: SubscriptionEmitter;
  private subEmitters: Map<string, SubscriptionEmitter>; // Map<criteria, SubscriptionEmitter>
  private refCounts: Map<string, number>; // Map<criteria, refCount>
  private subscriptionCriteriaLookup: Map<string, string>; // Map<subscriptionId, criteria>
  private criteriaSubscriptionLookup: Map<string, string>; // Map<criteria, subscriptionId>
  private wsClosed: boolean;

  constructor(medplum: MedplumClient, wsOrUrl: WebSocket | string) {
    if (!(medplum instanceof MedplumClient)) {
      throw new OperationOutcomeError(validationError('First arg of constructor should be a `MedplumClient`'));
    }
    let ws: WebSocket;
    if (typeof wsOrUrl === 'string') {
      let url: string;
      try {
        url = new URL(wsOrUrl).toString();
      } catch (_err) {
        throw new OperationOutcomeError(validationError('Not a valid URL'));
      }
      ws = new WebSocket(url);
    } else if (!(wsOrUrl instanceof WebSocket)) {
      throw new OperationOutcomeError(validationError('Invalid WebSocket'));
    } else {
      ws = wsOrUrl;
    }

    this.medplum = medplum;
    this.ws = ws;
    this.masterSubEmitter = new SubscriptionEmitter();
    this.subEmitters = new Map<string, SubscriptionEmitter>();
    this.refCounts = new Map<string, number>();
    this.subscriptionCriteriaLookup = new Map<string, string>();
    this.criteriaSubscriptionLookup = new Map<string, string>();
    this.wsClosed = false;

    this.setupWebSocketListeners();
  }

  private setupWebSocketListeners(): void {
    const ws = this.ws;

    ws.addEventListener('message', (event: MessageEvent) => {
      const bundle = JSON.parse(event.data) as Bundle;
      // Get criteria for event
      const status = bundle?.entry?.[0]?.resource as SubscriptionStatus;
      // Handle heartbeat
      if (status.type === 'heartbeat') {
        this.masterSubEmitter?.dispatchEvent({ type: 'heartbeat', payload: bundle });
        return;
      }
      this.masterSubEmitter?.dispatchEvent({ type: 'message', payload: bundle });
      const criteria = this.subscriptionCriteriaLookup.get(resolveId(status.subscription) as string);
      if (!criteria) {
        console.warn('Received notification for criteria the SubscriptionManager is not listening for');
        return;
      }
      // Emit event for criteria
      this.subEmitters.get(criteria)?.dispatchEvent({ type: 'message', payload: bundle });
    });

    ws.addEventListener('error', () => {
      const errorEvent = {
        type: 'error',
        payload: new OperationOutcomeError(serverError(new Error('WebSocket error'))),
      } as SubscriptionEventMap['error'];
      this.masterSubEmitter?.dispatchEvent(errorEvent);
      for (const emitter of this.subEmitters.values()) {
        emitter.dispatchEvent(errorEvent);
      }
    });

    ws.addEventListener('close', () => {
      const closeEvent = { type: 'close' } as SubscriptionEventMap['close'];
      if (this.wsClosed) {
        this.masterSubEmitter?.dispatchEvent(closeEvent);
      }
      for (const emitter of this.subEmitters.values()) {
        emitter.dispatchEvent(closeEvent);
      }
    });
  }

  private emitConnect(subscriptionId: string): void {
    const connectEvent = { type: 'connect', payload: { subscriptionId } } as SubscriptionEventMap['connect'];
    this.masterSubEmitter?.dispatchEvent(connectEvent);
    for (const emitter of this.subEmitters.values()) {
      emitter.dispatchEvent(connectEvent);
    }
  }

  private emitError(criteria: string, error: Error): void {
    const errorEvent = { type: 'error', payload: error } as SubscriptionEventMap['error'];
    this.masterSubEmitter?.dispatchEvent(errorEvent);
    this.subEmitters.get(criteria)?.dispatchEvent(errorEvent);
  }

  private async getTokenForCriteria(criteria: string): Promise<[string, string]> {
    let subscriptionId = this.criteriaSubscriptionLookup.get(criteria);
    if (!subscriptionId) {
      // Make a new subscription
      const subscription = await this.medplum.createResource<Subscription>({
        resourceType: 'Subscription',
        status: 'active',
        reason: `WebSocket subscription for ${getReferenceString(this.medplum.getProfile() as ProfileResource)}`,
        criteria,
        channel: { type: 'websocket' },
      });
      subscriptionId = subscription.id as string;

      this.subscriptionCriteriaLookup.set(subscriptionId, criteria);
      this.criteriaSubscriptionLookup.set(criteria, subscriptionId);
    }

    // Get binding token
    const { parameter } = (await this.medplum.get(
      `/fhir/R4/Subscription/${subscriptionId}/$get-ws-binding-token`
    )) as Parameters;
    const token = parameter?.find((param) => param.name === 'token')?.valueString;
    const url = parameter?.find((param) => param.name === 'websocket-url')?.valueUrl;

    if (!token) {
      throw new OperationOutcomeError(validationError('Failed to get token'));
    }
    if (!url) {
      throw new OperationOutcomeError(validationError('Failed to get URL from $get-ws-binding-token'));
    }

    return [subscriptionId, token];
  }

  addCriteria(criteria: string): SubscriptionEmitter {
    if (this.masterSubEmitter) {
      this.masterSubEmitter[kAddCriteria](criteria);
    }
    if (this.subEmitters.has(criteria)) {
      this.refCounts.set(criteria, (this.refCounts.get(criteria) as number) + 1);
      return this.subEmitters.get(criteria) as SubscriptionEmitter;
    }
    const emitter = new SubscriptionEmitter(criteria);
    this.subEmitters.set(criteria, emitter);

    this.getTokenForCriteria(criteria)
      .then(([subscriptionId, token]) => {
        // Emit connect event
        this.emitConnect(subscriptionId);
        // Send binding message
        this.ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
      })
      .catch((err) => {
        this.emitError(criteria, err);
        this.subEmitters.delete(criteria);
      });

    this.refCounts.set(criteria, 1);
    return emitter;
  }

  removeCriteria(criteria: string): void {
    if (!this.refCounts.has(criteria)) {
      throw new OperationOutcomeError(
        badRequest('Criteria not known to `SubscriptionManager`. Possibly called remove too many times.')
      );
    }

    const newCount = (this.refCounts.get(criteria) as number) - 1;
    if (newCount > 0) {
      this.refCounts.set(criteria, newCount);
      return;
    }

    // If we are here, time to actually remove criteria
    this.refCounts.delete(criteria);

    // If actually removing
    const subscriptionId = this.criteriaSubscriptionLookup.get(criteria) as string;
    const disconnectEvent = { type: 'disconnect', payload: { subscriptionId } } as SubscriptionEventMap['disconnect'];
    // Remove from master
    if (this.masterSubEmitter) {
      this.masterSubEmitter[kRemoveCriteria](criteria);

      // Emit disconnect on master
      this.masterSubEmitter.dispatchEvent(disconnectEvent);
    }
    // Emit disconnect on criteria emitter
    this.subEmitters.get(criteria)?.dispatchEvent(disconnectEvent);
    this.subEmitters.delete(criteria);
  }

  closeWebSocket(): void {
    if (this.wsClosed) {
      return;
    }
    this.wsClosed = true;
    this.ws.close();
  }

  getCriteriaCount(): number {
    return this.subEmitters.size;
  }

  getMasterEmitter(): SubscriptionEmitter {
    if (!this.masterSubEmitter) {
      this.masterSubEmitter = new SubscriptionEmitter(...Array.from(this.subEmitters.keys()));
    }
    return this.masterSubEmitter;
  }
}
