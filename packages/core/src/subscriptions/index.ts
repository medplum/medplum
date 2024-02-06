import { Bundle, Parameters, Subscription, SubscriptionStatus } from '@medplum/fhirtypes';
import { MedplumClient } from '../client';
import { TypedEventTarget } from '../eventtarget';
import { OperationOutcomeError, validationError } from '../outcomes';
// import { ClientStorage, IClientStorage } from '../storage';
import { ProfileResource, getReferenceString, resolveId } from '../utils';

export type SubscriptionEventMap = {
  connect: { type: 'connect'; payload: { subscriptionId: string } };
  error: { type: 'error'; payload: Error };
  message: { type: 'message'; payload: Bundle };
  close: { type: 'close' };
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

const kAddCriteria = Symbol('medplum.SubscriptionEmitter.addCriteria');

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
}

export class SubscriptionManager {
  private medplum: MedplumClient;
  private ws: WebSocket;
  // private storage: IClientStorage;
  private masterSubEmitter?: SubscriptionEmitter;
  private subEmitters: Map<string, SubscriptionEmitter>; // Map<criteria, SubscriptionEmitter>
  private subscriptionCriteriaLookup: Map<string, string>; // Map<subscriptionId, criteria>
  private criteriaSubscriptionLookup: Map<string, string>; // Map<criteria, subscriptionId>
  private wsClosed: boolean;

  // constructor(medplum: MedplumClient, wsOrUrl: WebSocket | string, options?: SubManagerOptions) {
  constructor(medplum: MedplumClient, wsOrUrl: WebSocket | string) {
    let ws: WebSocket;
    if (typeof wsOrUrl === 'string') {
      ws = new WebSocket(wsOrUrl);
    } else if (!(wsOrUrl instanceof WebSocket)) {
      throw new Error('Invalid WebSocket');
    } else {
      ws = wsOrUrl;
    }

    ws.addEventListener('message', (event: MessageEvent) => {
      const bundle = JSON.parse(event.data) as Bundle;
      this.masterSubEmitter?.dispatchEvent({ type: 'message', payload: bundle });
      // Get criteria for event
      const status = bundle?.entry?.[0]?.resource as SubscriptionStatus;
      const criteria = this.subscriptionCriteriaLookup.get(resolveId(status.subscription) as string);
      if (!criteria) {
        console.error('Received notification for criteria the SubscriptionManager is not listening for');
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
    // if (url !== '/ws/subscriptions-r4') {
    //   throw new OperationOutcomeError(
    //     validationError(`The returned URL "${url}" doesn't match the expected "/ws/subscriptions-r4"`)
    //   );
    // }

    return [subscriptionId, token];
  }

  addCriteria(criteria: string): SubscriptionEmitter {
    if (this.masterSubEmitter) {
      this.masterSubEmitter[kAddCriteria](criteria);
    }
    if (this.subEmitters.has(criteria)) {
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

    // Bind to token
    return emitter;
  }

  async removeCriteria(_criteria: string): Promise<void> {}

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

/*
===================
  Non-React usage
===================
async function exampleMain() {
  const medplum = new MedplumClient();
  const patientRefStr = getReferenceString({ resourceType: 'Patient', id: '123abc' });
  const docRefStr = getReferenceString({ resourceType: 'Patient', id: '123abc' });

  const criteria = `Communication?sender=${patientRefStr},${docRefStr}&recipient=${patientRefStr},${docRefStr}`;
  const listener = medplum.subscribeToCriteria(criteria);

  const bundles = [] as Bundle[];

  // Probably want to be able to listen to only certain kinds of messages...
  // For a given criteria...
  // listener.addEventListener('message', (event) =>

  listener.addEventListener(`message:${criteria}`, (event) => {
    const bundle = event.payload;
    bundles.push(bundle);
  });

  while (bundles.length < 10) {
    await sleep(100);
  }

  listener.removeCriteria(criteria);
}
*/
