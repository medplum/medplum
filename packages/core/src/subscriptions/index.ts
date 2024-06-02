import { Bundle, Parameters, Subscription, SubscriptionStatus, Resource } from '@medplum/fhirtypes';
import { MedplumClient } from '../client';
import { TypedEventTarget } from '../eventtarget';
import { OperationOutcomeError, serverError, validationError } from '../outcomes';
import { ProfileResource, getExtension, getReferenceString, resolveId } from '../utils';
import { Logger } from '../logger';
import { matchesSearchRequest } from '../search/match';
import { toTypedValue } from '../fhirpath/utils';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { parseSearchRequest } from '../search/search';

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
  subscriptionId?: string;

  constructor(criteria: string) {
    this.criteria = criteria;
    this.emitter = new SubscriptionEmitter(criteria);
    this.refCount = 1;
  }
}

export interface SubManagerOptions {
  RobustWebSocket: IRobustWebSocketCtor;
}

export class SubscriptionManager {
  private readonly medplum: MedplumClient;
  private ws: IRobustWebSocket;
  private masterSubEmitter?: SubscriptionEmitter;
  private criteriaEntries: Map<string, CriteriaEntry>; // Map<criteriaStr, CriteriaEntry>
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
    this.criteriaEntries = new Map<string, CriteriaEntry>();
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
        for (const { emitter } of this.criteriaEntries.values()) {
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
      for (const { emitter } of this.criteriaEntries.values()) {
        emitter.dispatchEvent(errorEvent);
      }
    });

    ws.addEventListener('close', () => {
      const closeEvent = { type: 'close' } as SubscriptionEventMap['close'];
      if (this.wsClosed) {
        this.masterSubEmitter?.dispatchEvent(closeEvent);
      }
      for (const { emitter } of this.criteriaEntries.values()) {
        emitter.dispatchEvent(closeEvent);
      }
    });
  }

  private emitConnect(subscriptionId: string): void {
    const connectEvent = { type: 'connect', payload: { subscriptionId } } as SubscriptionEventMap['connect'];
    this.masterSubEmitter?.dispatchEvent(connectEvent);
    for (const { emitter } of this.criteriaEntries.values()) {
      emitter.dispatchEvent(connectEvent);
    }
  }

  private emitError(criteria: string, error: Error): void {
    const errorEvent = { type: 'error', payload: error } as SubscriptionEventMap['error'];
    this.masterSubEmitter?.dispatchEvent(errorEvent);
    this.criteriaEntries.get(criteria)?.emitter?.dispatchEvent(errorEvent);
  }

  private async getTokenForCriteria(criteriaEntry: CriteriaEntry): Promise<[string, string]> {
    let subscriptionId = criteriaEntry?.subscriptionId;
    if (!subscriptionId) {
      // Make a new subscription
      const subscription = await this.medplum.createResource<Subscription>({
        resourceType: 'Subscription',
        status: 'active',
        reason: `WebSocket subscription for ${getReferenceString(this.medplum.getProfile() as ProfileResource)}`,
        criteria: criteriaEntry.criteria,
        channel: { type: 'websocket' },
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

  addCriteria(criteria: string): SubscriptionEmitter {
    if (this.masterSubEmitter) {
      this.masterSubEmitter._addCriteria(criteria);
    }
    const criteriaEntry = this.criteriaEntries.get(criteria);
    if (criteriaEntry) {
      criteriaEntry.refCount += 1;
      return criteriaEntry.emitter;
    }
    const newCriteriaEntry = new CriteriaEntry(criteria);
    this.criteriaEntries.set(criteria, newCriteriaEntry);

    this.getTokenForCriteria(newCriteriaEntry)
      .then(([subscriptionId, token]) => {
        newCriteriaEntry.subscriptionId = subscriptionId;
        this.criteriaEntriesBySubscriptionId.set(subscriptionId, newCriteriaEntry);
        // Emit connect event
        this.emitConnect(subscriptionId);
        // Send binding message
        this.ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
      })
      .catch((err) => {
        console.error(err.message);
        this.emitError(criteria, err);
        this.criteriaEntries.delete(criteria);
      });

    return newCriteriaEntry.emitter;
  }

  removeCriteria(criteria: string): void {
    const criteriaEntry = this.criteriaEntries.get(criteria);
    if (!criteriaEntry) {
      console.warn('Criteria not known to `SubscriptionManager`. Possibly called remove too many times.');
      return;
    }

    criteriaEntry.refCount -= 1;
    if (criteriaEntry.refCount > 0) {
      return;
    }

    // If actually removing
    const subscriptionId = this.criteriaEntries.get(criteria)?.subscriptionId;
    const disconnectEvent = { type: 'disconnect', payload: { subscriptionId } } as SubscriptionEventMap['disconnect'];
    // Remove from master
    if (this.masterSubEmitter) {
      this.masterSubEmitter._removeCriteria(criteria);

      // Emit disconnect on master
      this.masterSubEmitter.dispatchEvent(disconnectEvent);
    }
    // Emit disconnect on criteria emitter
    this.criteriaEntries.get(criteria)?.emitter?.dispatchEvent(disconnectEvent);
    this.criteriaEntries.delete(criteria);
    if (subscriptionId) {
      this.criteriaEntriesBySubscriptionId.delete(subscriptionId);
    }
  }

  closeWebSocket(): void {
    if (this.wsClosed) {
      return;
    }
    this.wsClosed = true;
    this.ws.close();
  }

  getCriteriaCount(): number {
    return this.criteriaEntries.size;
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
  console.log(evalValue);
  return evalValue?.[0]?.value === true;
}
