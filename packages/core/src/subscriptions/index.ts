// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Parameters, Project, Resource, Subscription, SubscriptionStatus } from '@medplum/fhirtypes';
import { LRUCache } from '../cache';
import { MedplumClient } from '../client';
import { TypedEventTarget } from '../eventtarget';
import type { FhirPathAtom } from '../fhirpath/atoms';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { toTypedValue } from '../fhirpath/utils';
import type { Logger } from '../logger';
import { normalizeErrorString, OperationOutcomeError, serverError, validationError } from '../outcomes';
import { matchesSearchRequest } from '../search/match';
import { parseSearchRequest } from '../search/search';
import type { ProfileResource, WithId } from '../utils';
import { deepEquals, extractAccountReferences, getExtension, getReferenceString, resolveId } from '../utils';
import type { IReconnectingWebSocket, IReconnectingWebSocketCtor } from '../websockets/reconnecting-websocket';
import { ReconnectingWebSocket } from '../websockets/reconnecting-websocket';
import {
  DEFAULT_PING_INTERVAL_MS,
  WS_SUB_TOKEN_EXPIRY_GRACE_PERIOD_MS,
  WS_SUB_TOKEN_REFRESH_INTERVAL_MS,
} from './constants';

const WS_STATES_THAT_NEED_RECONNECT = [WebSocket.CLOSING, WebSocket.CLOSED] as readonly number[];

export type CriteriaState = 'idle' | 'connecting' | 'active' | 'refreshing' | 'removed';

export type SubscriptionEventMap = {
  connect: { type: 'connect'; payload: { subscriptionId: string } };
  disconnect: { type: 'disconnect'; payload: { subscriptionId: string } };
  error: { type: 'error'; payload: Error };
  message: { type: 'message'; payload: Bundle };
  open: { type: 'open' };
  close: { type: 'close' };
  heartbeat: { type: 'heartbeat'; payload: Bundle };
};

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
  private readonly criteria: Set<string>;
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
  tokenExpiry?: number;
  state: CriteriaState = 'idle';
  generation = 0;

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

  nextGeneration(): number {
    return ++this.generation;
  }

  clearAttachedSubscription(): void {
    this.subscriptionId = undefined;
    this.token = undefined;
    this.tokenExpiry = undefined;
    this.state = 'idle';
    this.generation++;
  }
}

type CriteriaMapEntry = { bareCriteria?: CriteriaEntry; criteriaWithProps: CriteriaEntry[] };

export interface SubManagerOptions {
  ReconnectingWebSocket?: IReconnectingWebSocketCtor;
  pingIntervalMs?: number;
  debug?: boolean;
  debugLogger?: (...args: any[]) => void;
}

export class SubscriptionManager {
  private readonly medplum: MedplumClient;
  private readonly ws: IReconnectingWebSocket;
  private masterSubEmitter?: SubscriptionEmitter;
  private readonly criteriaEntries: Map<string, CriteriaMapEntry>; // Map<criteriaStr, CriteriaMapEntry>
  private readonly criteriaEntriesBySubscriptionId: Map<string, CriteriaEntry>; // Map<subscriptionId, CriteriaEntry>
  private wsClosed: boolean;
  private pingTimer: ReturnType<typeof setInterval> | undefined = undefined;
  private tokenRefreshTimer: ReturnType<typeof setInterval> | undefined = undefined;
  private readonly pingIntervalMs: number;
  private waitingForPong = false;
  private currentProfile: ProfileResource | undefined;

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
    const ws = options?.ReconnectingWebSocket
      ? new options.ReconnectingWebSocket(url, undefined, { debug: options?.debug, debugLogger: options?.debugLogger })
      : new ReconnectingWebSocket(url, undefined, { debug: options?.debug, debugLogger: options?.debugLogger });

    this.medplum = medplum;
    this.ws = ws;
    this.masterSubEmitter = new SubscriptionEmitter();
    this.criteriaEntries = new Map<string, CriteriaMapEntry>();
    this.criteriaEntriesBySubscriptionId = new Map<string, CriteriaEntry>();
    this.wsClosed = false;
    this.pingIntervalMs = options?.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.currentProfile = medplum.getProfile();

    this.setupListeners();
  }

  private setupListeners(): void {
    const ws = this.ws;

    ws.addEventListener('message', (event) => {
      try {
        const parsedData = JSON.parse(event.data) as { type: 'pong' } | Bundle;
        if (parsedData.type === 'pong') {
          this.waitingForPong = false;
          return;
        }
        const bundle = parsedData;
        // Get criteria for event
        const status = bundle?.entry?.[0]?.resource as SubscriptionStatus;

        // Handle heartbeat
        if (status.type === 'heartbeat') {
          this.masterSubEmitter?.dispatchEvent({ type: 'heartbeat', payload: bundle });
          return;
        }

        // Handle handshake
        if (status.type === 'handshake') {
          const subscriptionId = resolveId(status.subscription) as string;
          const connectEvent = {
            type: 'connect',
            payload: { subscriptionId },
          } as const;
          this.masterSubEmitter?.dispatchEvent(connectEvent);
          const criteriaEntry = this.criteriaEntriesBySubscriptionId.get(subscriptionId);
          if (!criteriaEntry) {
            console.warn('Received handshake for criteria the SubscriptionManager is not listening for yet');
            return;
          }
          if (criteriaEntry.state === 'connecting' || criteriaEntry.state === 'refreshing') {
            criteriaEntry.state = 'active';
          }
          criteriaEntry.emitter.dispatchEvent({ ...connectEvent });
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
          emitter.dispatchEvent({ ...errorEvent });
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
        emitter.dispatchEvent({ ...errorEvent });
      }
    });

    ws.addEventListener('close', () => {
      const closeEvent = { type: 'close' } as SubscriptionEventMap['close'];
      this.masterSubEmitter?.dispatchEvent(closeEvent);
      for (const emitter of this.getAllCriteriaEmitters()) {
        emitter.dispatchEvent({ ...closeEvent });
      }

      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = undefined;
        this.waitingForPong = false;
      }

      if (this.tokenRefreshTimer) {
        clearInterval(this.tokenRefreshTimer);
        this.tokenRefreshTimer = undefined;
      }

      if (this.wsClosed) {
        this.criteriaEntries.clear();
        this.criteriaEntriesBySubscriptionId.clear();
        this.masterSubEmitter?.removeAllListeners();
      }
    });

    ws.addEventListener('open', () => {
      const openEvent = { type: 'open' } as SubscriptionEventMap['open'];
      this.masterSubEmitter?.dispatchEvent(openEvent);
      for (const emitter of this.getAllCriteriaEmitters()) {
        emitter.dispatchEvent({ ...openEvent });
      }
      // We do this after dispatching the events so listeners can check if this is the initial open or not
      // We are reconnecting
      // So we refresh all current subscriptions
      this.refreshAllSubscriptions().catch(console.error);

      if (!this.pingTimer) {
        this.pingTimer = setInterval(() => {
          if (this.waitingForPong) {
            this.waitingForPong = false;
            ws.reconnect();
            return;
          }
          ws.send(JSON.stringify({ type: 'ping' }));
          this.waitingForPong = true;
        }, this.pingIntervalMs);
      }

      this.tokenRefreshTimer ??= setInterval(() => {
        this.checkTokenExpirations();
        this.gcOrphanedEntries();
      }, WS_SUB_TOKEN_REFRESH_INTERVAL_MS);
    });

    this.medplum.addEventListener('change', () => {
      const nextProfile = this.medplum.getProfile();
      if (this.currentProfile && nextProfile === undefined) {
        this.ws.close();
      } else if (nextProfile && this.currentProfile?.id !== nextProfile.id) {
        this.ws.reconnect();
      }
      this.currentProfile = nextProfile;
    });
  }

  private sendBind(token: string): void {
    this.ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
  }

  private sendUnbind(token: string): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unbind-from-token', payload: { token } }));
    }
  }

  private emitError(criteriaEntry: CriteriaEntry, error: Error): void {
    const errorEvent = { type: 'error', payload: error } as SubscriptionEventMap['error'];
    this.masterSubEmitter?.dispatchEvent(errorEvent);
    criteriaEntry.emitter.dispatchEvent({ ...errorEvent });
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
      criteriaEntry.emitter.dispatchEvent({ ...disconnectEvent });
    } else {
      console.warn('Called disconnect for `CriteriaEntry` before `subscriptionId` was present.');
    }
  }

  private isStale(criteriaEntry: CriteriaEntry, expectedGen: number): boolean {
    return criteriaEntry.state === 'removed' || criteriaEntry.generation !== expectedGen;
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
    criteriaEntry.state = 'removed';
    criteriaEntry.generation++;
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
      this.sendUnbind(token);
    }
  }

  private async subscribeToCriteria(criteriaEntry: CriteriaEntry): Promise<void> {
    // If the WebSocket was closed explicitly by us, then we will need to re-open it before continuing
    if (this.wsClosed) {
      await this.reconnectIfNeeded();
    }
    // If WS is not open, the entry will be refreshed via refreshAllSubscriptions on the next 'open' event
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    // Only subscribe idle entries — connecting/active/refreshing entries already have an operation in progress,
    // and removed entries are dead
    if (criteriaEntry.state !== 'idle') {
      return;
    }
    criteriaEntry.state = 'connecting';
    await this.rebindCriteriaEntry(criteriaEntry);
  }

  private async refreshAllSubscriptions(): Promise<void> {
    this.criteriaEntriesBySubscriptionId.clear();
    for (const mapEntry of this.criteriaEntries.values()) {
      for (const criteriaEntry of [
        ...(mapEntry.bareCriteria ? [mapEntry.bareCriteria] : []),
        ...mapEntry.criteriaWithProps,
      ]) {
        criteriaEntry.clearAttachedSubscription();
        await this.subscribeToCriteria(criteriaEntry);
      }
    }
  }

  private async rebindCriteriaEntry(criteriaEntry: CriteriaEntry): Promise<void> {
    const expectedGen = criteriaEntry.nextGeneration();
    try {
      // Step 1: Ensure a Subscription resource exists
      if (!criteriaEntry.subscriptionId) {
        const subscription = await this.medplum.createResource<Subscription>({
          ...criteriaEntry.subscriptionProps,
          resourceType: 'Subscription',
          status: 'active',
          reason: `WebSocket subscription for ${getReferenceString(this.medplum.getProfile() as ProfileResource)}`,
          channel: { type: 'websocket' },
          criteria: criteriaEntry.criteria,
        });
        if (this.isStale(criteriaEntry, expectedGen)) {
          return;
        }
        // Persist immediately so retries reuse the same Subscription resource
        criteriaEntry.subscriptionId = subscription.id;
      }

      // Step 2: Get a binding token
      const { parameter } = await this.medplum.get<Parameters>(
        `fhir/R4/Subscription/${criteriaEntry.subscriptionId}/$get-ws-binding-token`,
        { cache: 'no-cache' }
      );
      const token = parameter?.find((param) => param.name === 'token')?.valueString;
      const url = parameter?.find((param) => param.name === 'websocket-url')?.valueUrl;
      const expiration = parameter?.find((param) => param.name === 'expiration')?.valueDateTime;

      if (!token) {
        throw new OperationOutcomeError(validationError('Failed to get token'));
      }
      if (!url) {
        throw new OperationOutcomeError(validationError('Failed to get URL from $get-ws-binding-token'));
      }
      if (!expiration) {
        throw new OperationOutcomeError(validationError('Failed to get expiration from $get-ws-binding-token'));
      }

      // Step 3: Verify the operation is still valid after all async work
      if (this.isStale(criteriaEntry, expectedGen)) {
        this.sendUnbind(token);
        return;
      }
      criteriaEntry.token = token;
      criteriaEntry.tokenExpiry = new Date(expiration).getTime();
      this.criteriaEntriesBySubscriptionId.set(criteriaEntry.subscriptionId, criteriaEntry);
      this.sendBind(token);
    } catch (err: unknown) {
      console.error(normalizeErrorString(err));
      // Revert to a retryable state so the entry isn't permanently stuck
      if (criteriaEntry.generation === expectedGen && criteriaEntry.state !== 'removed') {
        criteriaEntry.state = criteriaEntry.state === 'refreshing' ? 'active' : 'idle';
      }
      this.emitError(criteriaEntry, err as Error);
    }
  }

  private checkTokenExpirations(): void {
    const now = Date.now();
    for (const mapEntry of this.criteriaEntries.values()) {
      for (const criteriaEntry of [
        ...(mapEntry.bareCriteria ? [mapEntry.bareCriteria] : []),
        ...mapEntry.criteriaWithProps,
      ]) {
        if (!criteriaEntry.tokenExpiry) {
          continue;
        }
        if (
          criteriaEntry.tokenExpiry - now <= WS_SUB_TOKEN_EXPIRY_GRACE_PERIOD_MS &&
          criteriaEntry.state === 'active' &&
          this.ws.readyState === WebSocket.OPEN
        ) {
          criteriaEntry.state = 'refreshing';
          this.rebindCriteriaEntry(criteriaEntry).catch((err: Error) => {
            this.masterSubEmitter?.dispatchEvent({ type: 'error', payload: err });
          });
        }
      }
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

    this.subscribeToCriteria(newCriteriaEntry).catch(console.error);

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

  /**
   * Removes any entries from the subscription-ID lookup that are no longer tracked
   * in the primary criteria map. For each orphan found, an `unbind-from-token` message
   * is sent so the server can release the binding.
   *
   * Called automatically on the token-refresh timer. Can also be called manually.
   */
  gcOrphanedEntries(): void {
    for (const [subscriptionId, entry] of this.criteriaEntriesBySubscriptionId) {
      if (entry.state === 'removed' || !this.maybeGetCriteriaEntry(entry.criteria, entry.subscriptionProps)) {
        this.criteriaEntriesBySubscriptionId.delete(subscriptionId);
        if (entry.token) {
          this.sendUnbind(entry.token);
        }
      }
    }
  }

  getWebSocket(): IReconnectingWebSocket {
    return this.ws;
  }

  closeWebSocket(): void {
    if (this.wsClosed) {
      return;
    }
    this.wsClosed = true;
    this.ws.close();
  }

  reconnectWebSocket(): void {
    this.ws.reconnect();
    this.wsClosed = false;
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

  async reconnectIfNeeded(): Promise<void> {
    if (!WS_STATES_THAT_NEED_RECONNECT.includes(this.getWebSocket().readyState)) {
      return;
    }

    await new Promise<void>((resolve) => {
      const tmpCb = (): void => {
        this.getWebSocket().removeEventListener('open', tmpCb);
        resolve();
      };
      this.getWebSocket().addEventListener('open', tmpCb);
      this.reconnectWebSocket();
    });
  }
}

export type BackgroundJobInteraction = 'create' | 'update' | 'delete';

export interface BackgroundJobContext {
  project?: WithId<Project>;
  interaction: BackgroundJobInteraction;
}

export type ResourceMatchesSubscriptionCriteria = {
  resource: Resource;
  subscription: Subscription;
  context: BackgroundJobContext;
  logger?: Logger;
  getPreviousResource: (currentResource: Resource) => Promise<Resource | undefined>;
};

const subscriptionExprCache = new LRUCache<FhirPathAtom>(1000);

export async function resourceMatchesSubscriptionCriteria({
  resource,
  subscription,
  context,
  getPreviousResource,
  logger,
}: ResourceMatchesSubscriptionCriteria): Promise<boolean> {
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

  if (!matchesSearchRequest(resource, searchRequest)) {
    return false;
  }

  const subscriptionAccounts = extractAccountReferences(subscription.meta) ?? [];
  const resourceAccounts = extractAccountReferences(resource.meta) ?? [];

  if (subscriptionAccounts.length) {
    // Check if there is any common account between the subscription and the resource
    if (
      !subscriptionAccounts.some((subAccount) =>
        resourceAccounts.some((resAccount) => resAccount.reference === subAccount.reference)
      )
    ) {
      logger?.debug('Subscription suppressed due to mismatched accounts', {
        subscriptionId: subscription.id,
        resource: getReferenceString(resource),
      });
      return false;
    }
  }

  return true;
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
  const evalValue = evalFhirPathTyped(
    criteria.valueString,
    [toTypedValue(currentResource)],
    evalInput,
    subscriptionExprCache
  );
  return evalValue?.[0]?.value === true;
}
