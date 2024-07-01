import { Bundle, Parameters, Resource, Subscription, SubscriptionStatus } from '@medplum/fhirtypes';
import { MedplumClient } from '../client';
import { TypedEventTarget } from '../eventtarget';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { toTypedValue } from '../fhirpath/utils';
import { Logger } from '../logger';
import { OperationOutcomeError, serverError, validationError } from '../outcomes';
import { matchesSearchRequest } from '../search/match';
import { parseSearchRequest } from '../search/search';
import { ProfileResource, deepEquals, getExtension, getReferenceString, resolveId } from '../utils';

export type SubscriptionEventMap = {
  connect: { type: 'connect'; payload: { subscriptionId: string } };
  disconnect: { type: 'disconnect'; payload: { subscriptionId: string } };
  error: { type: 'error'; payload: Error };
  message: { type: 'message'; payload: Bundle };
  open: { type: 'open' };
  close: { type: 'close' };
  heartbeat: { type: 'heartbeat'; payload: Bundle };
};

export type RobustWebSocketEventMap = {
  open: { type: 'open' };
  message: MessageEvent;
  error: Event;
  close: CloseEvent;
};

export interface IRobustWebSocket extends TypedEventTarget<RobustWebSocketEventMap> {
  readyState: number;
  close(): void;
  send(message: string): void;
}

export interface IRobustWebSocketCtor {
  new (url: string): IRobustWebSocket;
}

export class RobustWebSocket extends TypedEventTarget<RobustWebSocketEventMap> implements IRobustWebSocket {
  private ws: WebSocket;
  private messageBuffer: string[];
  bufferedAmount = -Infinity;
  extensions = 'NOT_IMPLEMENTED';

  constructor(url: string) {
    super();
    this.messageBuffer = [];

    const ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      if (this.messageBuffer.length) {
        const buffer = this.messageBuffer;
        for (const msg of buffer) {
          ws.send(msg);
        }
      }
      this.dispatchEvent(new Event('open'));
    });

    ws.addEventListener('error', (event) => {
      this.dispatchEvent(event);
    });

    ws.addEventListener('message', (event) => {
      this.dispatchEvent(event);
    });

    ws.addEventListener('close', (event) => {
      this.dispatchEvent(event);
    });

    this.ws = ws;
  }

  get readyState(): number {
    return this.ws.readyState;
  }

  close(): void {
    this.ws.close();
  }

  send(message: string): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      this.messageBuffer.push(message);
      return;
    }

    try {
      this.ws.send(message);
    } catch (err: unknown) {
      this.dispatchEvent(new ErrorEvent('error', { error: err as Error, message: (err as Error).message }));
      this.messageBuffer.push(message);
    }
  }
}

/**
 * An `EventTarget` that emits events when new subscription notifications come in over WebSockets.
 *
 * -----
 *
 * ### Events emitted:
 *
 * - `connect` - A new subscription is connected to the `SubscriptionManager` and `message` events for this subscription can be expected.
 * - `disconnect` - The specified subscription is no longer being monitored by the `SubscriptionManager`.
 * - `error` - An error has occurred.
 * - `message` - A message containing a notification `Bundle` has been received.
 * - `open` - The WebSocket has been opened.
 * - `close` - The WebSocket has been closed.
 * - `heartbeat` - A `heartbeat` message has been received.
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
  /**
   * @internal
   * @param criteria - The criteria to add to this `SubscriptionEmitter`.
   */
  _addCriteria(criteria: string): void {
    this.criteria.add(criteria);
  }
  /**
   * @internal
   * @param criteria - The criteria to remove from this `SubscriptionEmitter`.
   */
  _removeCriteria(criteria: string): void {
    this.criteria.delete(criteria);
  }
}

class CriteriaEntry {
  readonly criteria: string;
  readonly emitter: SubscriptionEmitter;
  refCount: number;
  readonly subscriptionProps?: Partial<Subscription>;
  subscriptionId?: string;
  token?: string;

  constructor(criteria: string, subscriptionProps?: Partial<Subscription>) {
    this.criteria = criteria;
    this.emitter = new SubscriptionEmitter(criteria);
    this.refCount = 1;
    this.subscriptionProps = subscriptionProps
      ? {
          ...subscriptionProps,
        }
      : undefined;
  }
}

type CriteriaMapEntry = { bareCriteria?: CriteriaEntry; criteriaWithProps: CriteriaEntry[] };

export interface SubManagerOptions {
  RobustWebSocket: IRobustWebSocketCtor;
}

export class SubscriptionManager {
  private readonly medplum: MedplumClient;
  private ws: IRobustWebSocket;
  private masterSubEmitter?: SubscriptionEmitter;
  private criteriaEntries: Map<string, CriteriaMapEntry>; // Map<criteriaStr, CriteriaMapEntry>
  private criteriaEntriesBySubscriptionId: Map<string, CriteriaEntry>; // Map<subscriptionId, CriteriaEntry>
  private wsClosed: boolean;

  constructor(medplum: MedplumClient, wsUrl: URL | string, options?: SubManagerOptions) {
    if (!(medplum instanceof MedplumClient)) {
      throw new OperationOutcomeError(validationError('First arg of constructor should be a `MedplumClient`'));
    }
    let url: string;
    try {
      url = new URL(wsUrl).toString();
    } catch (_err) {
      throw new OperationOutcomeError(validationError('Not a valid URL'));
    }
    const ws = options?.RobustWebSocket ? new options.RobustWebSocket(url) : new RobustWebSocket(url);

    this.medplum = medplum;
    this.ws = ws;
    this.masterSubEmitter = new SubscriptionEmitter();
    this.criteriaEntries = new Map<string, CriteriaMapEntry>();
    this.criteriaEntriesBySubscriptionId = new Map<string, CriteriaEntry>();
    this.wsClosed = false;

    this.setupWebSocketListeners();
  }

  private setupWebSocketListeners(): void {
    const ws = this.ws;

    ws.addEventListener('message', (event) => {
      try {
        const bundle = JSON.parse(event.data) as Bundle;
        // Get criteria for event
        const status = bundle?.entry?.[0]?.resource as SubscriptionStatus;
        // Handle heartbeat
        if (status.type === 'heartbeat') {
          this.masterSubEmitter?.dispatchEvent({ type: 'heartbeat', payload: bundle });
          return;
        }
        this.masterSubEmitter?.dispatchEvent({ type: 'message', payload: bundle });
        const criteriaEntry = this.criteriaEntriesBySubscriptionId.get(resolveId(status.subscription) as string);
        if (!criteriaEntry) {
          console.warn('Received notification for criteria the SubscriptionManager is not listening for');
          return;
        }
        // Emit event for criteria
        criteriaEntry.emitter.dispatchEvent({ type: 'message', payload: bundle });
      } catch (err: unknown) {
        console.error(err);
        const errorEvent = { type: 'error', payload: err as Error } as SubscriptionEventMap['error'];
        this.masterSubEmitter?.dispatchEvent(errorEvent);
        for (const emitter of this.getAllCriteriaEmitters()) {
          emitter.dispatchEvent(errorEvent);
        }
      }
    });

    ws.addEventListener('error', () => {
      const errorEvent = {
        type: 'error',
        payload: new OperationOutcomeError(serverError(new Error('WebSocket error'))),
      } as SubscriptionEventMap['error'];
      this.masterSubEmitter?.dispatchEvent(errorEvent);
      for (const emitter of this.getAllCriteriaEmitters()) {
        emitter.dispatchEvent(errorEvent);
      }
    });

    ws.addEventListener('close', () => {
      const closeEvent = { type: 'close' } as SubscriptionEventMap['close'];
      if (this.wsClosed) {
        this.masterSubEmitter?.dispatchEvent(closeEvent);
      }
      for (const emitter of this.getAllCriteriaEmitters()) {
        emitter.dispatchEvent(closeEvent);
      }
    });
  }

  private emitConnect(criteriaEntry: CriteriaEntry): void {
    const connectEvent = {
      type: 'connect',
      payload: { subscriptionId: criteriaEntry.subscriptionId as string },
    } as SubscriptionEventMap['connect'];
    this.masterSubEmitter?.dispatchEvent(connectEvent);
    for (const emitter of this.getAllCriteriaEmitters()) {
      emitter.dispatchEvent(connectEvent);
    }
  }

  private emitError(criteriaEntry: CriteriaEntry, error: Error): void {
    const errorEvent = { type: 'error', payload: error } as SubscriptionEventMap['error'];
    this.masterSubEmitter?.dispatchEvent(errorEvent);
    criteriaEntry.emitter.dispatchEvent(errorEvent);
  }

  private maybeEmitDisconnect(criteriaEntry: CriteriaEntry): void {
    const { subscriptionId } = criteriaEntry;
    if (subscriptionId) {
      const disconnectEvent = {
        type: 'disconnect',
        payload: { subscriptionId },
      } as SubscriptionEventMap['disconnect'];
      // Emit disconnect on master
      this.masterSubEmitter?.dispatchEvent(disconnectEvent);
      // Emit disconnect on criteria emitter
      criteriaEntry.emitter.dispatchEvent(disconnectEvent);
    } else {
      console.warn('Called disconnect for `CriteriaEntry` before `subscriptionId` was present.');
    }
  }

  private async getTokenForCriteria(criteriaEntry: CriteriaEntry): Promise<[string, string]> {
    let subscriptionId = criteriaEntry?.subscriptionId;
    if (!subscriptionId) {
      // Make a new subscription
      const subscription = await this.medplum.createResource<Subscription>({
        ...criteriaEntry.subscriptionProps,
        resourceType: 'Subscription',
        status: 'active',
        reason: `WebSocket subscription for ${getReferenceString(this.medplum.getProfile() as ProfileResource)}`,
        channel: { type: 'websocket' },
        criteria: criteriaEntry.criteria,
      });
      subscriptionId = subscription.id as string;
    }

    // Get binding token
    const { parameter } = (await this.medplum.get(
      `fhir/R4/Subscription/${subscriptionId}/$get-ws-binding-token`
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

  private maybeGetCriteriaEntry(
    criteria: string,
    subscriptionProps?: Partial<Subscription>
  ): CriteriaEntry | undefined {
    const entries = this.criteriaEntries.get(criteria);
    if (!entries) {
      return undefined;
    }
    if (!subscriptionProps) {
      return entries.bareCriteria;
    }
    for (const entry of entries.criteriaWithProps) {
      if (deepEquals(subscriptionProps, entry.subscriptionProps)) {
        return entry;
      }
    }
    return undefined;
  }

  private getAllCriteriaEmitters(): SubscriptionEmitter[] {
    const emitters = [];
    for (const mapEntry of this.criteriaEntries.values()) {
      if (mapEntry.bareCriteria) {
        emitters.push(mapEntry.bareCriteria.emitter);
      }
      for (const entry of mapEntry.criteriaWithProps) {
        emitters.push(entry.emitter);
      }
    }
    return emitters;
  }

  private addCriteriaEntry(criteriaEntry: CriteriaEntry): void {
    const { criteria, subscriptionProps } = criteriaEntry;
    let mapEntry: CriteriaMapEntry;
    if (!this.criteriaEntries.has(criteria)) {
      mapEntry = { criteriaWithProps: [] as CriteriaEntry[] };
      this.criteriaEntries.set(criteria, mapEntry);
    } else {
      mapEntry = this.criteriaEntries.get(criteria) as CriteriaMapEntry;
    }
    // We can assume because this will be "guarded" by `maybeGetCriteriaEntry()`,
    // that we don't need to check if a matching `CriteriaEntry` exists
    // We just need to put the given one into the right spot
    if (!subscriptionProps) {
      mapEntry.bareCriteria = criteriaEntry;
    } else {
      mapEntry.criteriaWithProps.push(criteriaEntry);
    }
  }

  private removeCriteriaEntry(criteriaEntry: CriteriaEntry): void {
    const { criteria, subscriptionProps, subscriptionId, token } = criteriaEntry;
    if (!this.criteriaEntries.has(criteria)) {
      return;
    }
    const mapEntry = this.criteriaEntries.get(criteria) as CriteriaMapEntry;
    if (!subscriptionProps) {
      mapEntry.bareCriteria = undefined;
    } else {
      mapEntry.criteriaWithProps = mapEntry.criteriaWithProps.filter((otherEntry): boolean => {
        const otherProps = otherEntry.subscriptionProps as Partial<Subscription>;
        return !deepEquals(subscriptionProps, otherProps);
      });
    }
    if (!mapEntry.bareCriteria && mapEntry.criteriaWithProps.length === 0) {
      this.criteriaEntries.delete(criteria);
      this.masterSubEmitter?._removeCriteria(criteria);
    }
    if (subscriptionId) {
      this.criteriaEntriesBySubscriptionId.delete(subscriptionId);
    }
    if (token) {
      this.ws.send(JSON.stringify({ type: 'unbind-from-token', payload: { token } }));
    }
  }

  addCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): SubscriptionEmitter {
    if (this.masterSubEmitter) {
      this.masterSubEmitter._addCriteria(criteria);
    }

    const criteriaEntry = this.maybeGetCriteriaEntry(criteria, subscriptionProps);
    if (criteriaEntry) {
      criteriaEntry.refCount += 1;
      return criteriaEntry.emitter;
    }

    const newCriteriaEntry = new CriteriaEntry(criteria, subscriptionProps);
    this.addCriteriaEntry(newCriteriaEntry);

    this.getTokenForCriteria(newCriteriaEntry)
      .then(([subscriptionId, token]) => {
        newCriteriaEntry.subscriptionId = subscriptionId;
        newCriteriaEntry.token = token;
        this.criteriaEntriesBySubscriptionId.set(subscriptionId, newCriteriaEntry);
        // Emit connect event
        this.emitConnect(newCriteriaEntry);
        // Send binding message
        this.ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
      })
      .catch((err) => {
        console.error(err.message);
        this.emitError(newCriteriaEntry, err);
        this.removeCriteriaEntry(newCriteriaEntry);
      });

    return newCriteriaEntry.emitter;
  }

  removeCriteria(criteria: string, subscriptionProps?: Partial<Subscription>): void {
    const criteriaEntry = this.maybeGetCriteriaEntry(criteria, subscriptionProps);
    if (!criteriaEntry) {
      console.warn('Criteria not known to `SubscriptionManager`. Possibly called remove too many times.');
      return;
    }

    criteriaEntry.refCount -= 1;
    if (criteriaEntry.refCount > 0) {
      return;
    }

    // If actually removing (refcount === 0)
    this.maybeEmitDisconnect(criteriaEntry);
    this.removeCriteriaEntry(criteriaEntry);
  }

  closeWebSocket(): void {
    if (this.wsClosed) {
      return;
    }
    this.wsClosed = true;
    this.ws.close();
  }

  getCriteriaCount(): number {
    return this.getAllCriteriaEmitters().length;
  }

  getMasterEmitter(): SubscriptionEmitter {
    if (!this.masterSubEmitter) {
      this.masterSubEmitter = new SubscriptionEmitter(...Array.from(this.criteriaEntries.keys()));
    }
    return this.masterSubEmitter;
  }
}

export type BackgroundJobInteraction = 'create' | 'update' | 'delete';

export interface BackgroundJobContext {
  interaction: BackgroundJobInteraction;
}

export type ResourceMatchesSubscriptionCriteria = {
  resource: Resource;
  subscription: Subscription;
  context: BackgroundJobContext;
  logger?: Logger;
  getPreviousResource: (currentResource: Resource) => Promise<Resource | undefined>;
};

export async function resourceMatchesSubscriptionCriteria({
  resource,
  subscription,
  context,
  getPreviousResource,
  logger,
}: ResourceMatchesSubscriptionCriteria): Promise<boolean> {
  if (subscription.meta?.account && resource.meta?.account?.reference !== subscription.meta.account.reference) {
    logger?.debug('Ignore resource in different account compartment');
    return false;
  }

  if (!matchesChannelType(subscription, logger)) {
    logger?.debug(`Ignore subscription without recognized channel type`);
    return false;
  }

  const subscriptionCriteria = subscription.criteria;
  if (!subscriptionCriteria) {
    logger?.debug(`Ignore rest hook missing criteria`);
    return false;
  }

  const searchRequest = parseSearchRequest(subscriptionCriteria);
  if (resource.resourceType !== searchRequest.resourceType) {
    logger?.debug(
      `Ignore rest hook for different resourceType (wanted "${searchRequest.resourceType}", received "${resource.resourceType}")`
    );
    return false;
  }

  const fhirPathCriteria = await isFhirCriteriaMet(subscription, resource, getPreviousResource);
  if (!fhirPathCriteria) {
    logger?.debug(`Ignore rest hook for criteria returning false`);
    return false;
  }

  const supportedInteractionExtension = getExtension(
    subscription,
    'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction'
  );
  if (supportedInteractionExtension && supportedInteractionExtension.valueCode !== context.interaction) {
    logger?.debug(
      `Ignore rest hook for different interaction (wanted "${supportedInteractionExtension.valueCode}", received "${context.interaction}")`
    );
    return false;
  }

  return matchesSearchRequest(resource, searchRequest);
}

/**
 * Returns true if the subscription channel type is ok to execute.
 * @param subscription - The subscription resource.
 * @param logger - The logger.
 * @returns True if the subscription channel type is ok to execute.
 */
function matchesChannelType(subscription: Subscription, logger?: Logger): boolean {
  const channelType = subscription.channel?.type;

  if (channelType === 'rest-hook') {
    const url = subscription.channel?.endpoint;
    if (!url) {
      logger?.debug(`Ignore rest-hook missing URL`);
      return false;
    }

    return true;
  }

  if (channelType === 'websocket') {
    return true;
  }

  return false;
}

export async function isFhirCriteriaMet(
  subscription: Subscription,
  currentResource: Resource,
  getPreviousResource: (currentResource: Resource) => Promise<Resource | undefined>
): Promise<boolean> {
  const criteria = getExtension(
    subscription,
    'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression'
  );
  if (!criteria?.valueString) {
    return true;
  }
  const previous = await getPreviousResource(currentResource);
  const evalInput = {
    '%current': toTypedValue(currentResource),
    '%previous': toTypedValue(previous ?? {}),
  };
  const evalValue = evalFhirPathTyped(criteria.valueString, [toTypedValue(currentResource)], evalInput);
  return evalValue?.[0]?.value === true;
}
