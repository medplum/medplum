import { Bundle, Parameters, Subscription, SubscriptionStatus } from '@medplum/fhirtypes';
import { MedplumClient } from '../client';
import { TypedEventTarget } from '../eventtarget';
import { OperationOutcomeError, badRequest, validationError } from '../outcomes';
// import { ClientStorage, IClientStorage } from '../storage';
import { ProfileResource, getReferenceString, resolveId } from '../utils';

export type SubscriptionEventMap = {
  connect: { type: 'connect'; payload: { subscriptionId: string } };
  disconnect: { type: 'disconnect'; payload: { subscriptionId: string } };
  error: { type: 'error'; payload: Error };
  message: { type: 'message'; payload: Bundle };
  close: { type: 'close' };
  heartbeat: { type: 'heartbeat'; payload: Bundle };
};

// export type SubManagerOptions = {
//   // storage?: IClientStorage;
// };

// TODO: Support async IClientStorage ?
// TODO:
/*
export function parseResourcesFromBundle(bundle: Bundle): Resource[] {
  return [];
}
*/

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
  // private storage: IClientStorage;
  private masterSubEmitter?: SubscriptionEmitter;
  private subEmitters: Map<string, SubscriptionEmitter>; // Map<criteria, SubscriptionEmitter>
  private refCounts: Map<string, number>; // Map<criteria, refCount>
  private subscriptionCriteriaLookup: Map<string, string>; // Map<subscriptionId, criteria>
  private criteriaSubscriptionLookup: Map<string, string>; // Map<criteria, subscriptionId>
  private wsClosed: boolean;

  // constructor(medplum: MedplumClient, wsOrUrl: WebSocket | string, options?: SubManagerOptions) {
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
      this.masterSubEmitter?.dispatchEvent({ type: 'error', payload: new Error('Error ') });
    });

    ws.addEventListener('close', () => {
      if (this.wsClosed) {
        this.masterSubEmitter?.dispatchEvent({ type: 'close' });
      }
    });

    this.medplum = medplum;
    this.ws = ws;
    // this.storage = options?.storage ?? new ClientStorage();
    this.masterSubEmitter = new SubscriptionEmitter();
    this.subEmitters = new Map<string, SubscriptionEmitter>();
    this.refCounts = new Map<string, number>();
    this.subscriptionCriteriaLookup = new Map<string, string>();
    this.criteriaSubscriptionLookup = new Map<string, string>();
    this.wsClosed = false;
  }

  // private hydrateLookupTables(): Record<string, Subscription> {
  //   const storageSubs = this.storage.getObject<Record<string, Subscription>>('activeR4Subscriptions');
  //   if (!storageSubs) {
  //     return {};
  //   }
  //   for (const [subscriptionId, subscription] of Object.entries(storageSubs)) {
  //     // Get criteria
  //     const criteria = subscription.criteria;
  //     // Add criteria to sub -> criteria lookup
  //     this.subscriptionCriteriaLookup.set(subscriptionId, criteria);
  //     // Add criteria to criteria -> sub lookup
  //     this.criteriaSubscriptionLookup.set(criteria, subscriptionId);
  //   }
  //   return storageSubs;
  // }

  private emitConnect(subscriptionId: string): void {
    const connectEvent = { type: 'connect', payload: { subscriptionId } } as SubscriptionEventMap['connect'];
    this.masterSubEmitter?.dispatchEvent(connectEvent);
    for (const emitter of this.subEmitters.values()) {
      emitter.dispatchEvent(connectEvent);
    }
  }

  private async getTokenForCriteria(criteria: string): Promise<[string, string]> {
    // const activeSubs = this.hydrateLookupTables();
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

      // Add it to the active subscriptions
      // activeSubs[subscriptionId] = subscription;
      // Set active subs to current obj
      // this.storage.setObject<Record<string, Subscription>>('activeR4Subscriptions', activeSubs);
      //
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
      .catch(console.error);

    this.refCounts.set(criteria, 1);
    return emitter;
  }

  derefCriteria(criteria: string): void {
    if (!this.refCounts.has(criteria)) {
      throw new OperationOutcomeError(
        badRequest('Criteria not known to `SubscriptionManager`. Possibly called deref too many times.')
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
