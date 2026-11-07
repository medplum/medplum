// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentError, AgentResponseMessage } from '@medplum/core';
import { OperationOutcomeError, allOk, badRequest, normalizeErrorString } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { Redis } from 'ioredis';
import assert from 'node:assert';
import os from 'node:os';
import { globalLogger } from '../../../logger';
import { publish } from '../../../pubsub';
import { getPubSubRedisSubscriber } from '../../../redis';

const HOSTNAME = os.hostname();
const CALLBACK_CHANNEL_PREFIX = 'agent:cb';

type PendingCallback = {
  resolve: (result: [OperationOutcome, AgentResponseMessage | AgentError]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

const pendingCallbacks = new Map<string, PendingCallback>();
let sharedSubscriber: Redis | undefined;
let setupSubscriberPromise: Promise<void> | undefined;

/**
 * Returns the Redis pub/sub channel that this server process listens on for agent
 * response callbacks. All `Agent/$push` (and similar) operations on this process
 * receive their responses through this single channel, multiplexed by callback id.
 *
 * @returns The callback channel name for this server hostname.
 */
export function getAgentCallbackChannel(): string {
  return `${CALLBACK_CHANNEL_PREFIX}:${HOSTNAME}`;
}

/**
 * Builds a fully-qualified callback id of the form `agent:cb:${hostname}:${uuid}`.
 * The id is included verbatim in the agent request and echoed back on the response,
 * allowing the receiver to (a) derive the publish channel by stripping the last
 * `:uuid` segment and (b) demultiplex responses to the originating request.
 *
 * @param uuid - A unique id for this request.
 * @returns A callback id keyed off this server's hostname.
 */
export function buildAgentCallbackId(uuid: string): string {
  return `${getAgentCallbackChannel()}:${uuid}`;
}

/**
 * Derives the Redis pub/sub channel from a callback id sent back by the agent.
 *
 * New-style callback ids (`agent:cb:${hostname}:${uuid}`) contain a `:`-delimited
 * hostname prefix; the channel is everything before the last `:`. Legacy callback
 * ids without any `:` (e.g. `Agent/abc-uuid`) are treated as the channel itself,
 * preserving compatibility with peers that still publish per-callback channels.
 *
 * @param callback - The callback id from the agent response.
 * @returns The Redis channel to publish the response on, or `undefined` if the id is
 * malformed, i.e. neither shape yields a non-empty channel name.
 */
export function getCallbackChannelFromId(callback: string): string | undefined {
  const idx = callback.lastIndexOf(':');
  return (idx === -1 ? callback : callback.slice(0, idx)) || undefined;
}

/**
 * Publishes an agent response so that whichever server process is awaiting it receives it.
 *
 * Writes to both the shared per-hostname channel and the callback id itself. The
 * latter is the channel a server running the previous release subscribes to, and is
 * only needed until every process has been upgraded; see {@link subscribeLegacyCallbackChannel}.
 *
 * A callback id that yields no channel is malformed: the response is logged and dropped
 * rather than published somewhere arbitrary.
 *
 * @param callback - The callback id echoed back by the agent.
 * @param message - The serialized agent response.
 */
export async function publishAgentCallback(callback: string, message: string): Promise<void> {
  const channel = getCallbackChannelFromId(callback);
  if (!channel) {
    globalLogger.warn('[AgentCallback]: Dropping response with a malformed callback id', { callback });
    return;
  }
  await publish(channel, message);
  if (channel !== callback) {
    await publish(callback, message);
  }
}

/**
 * Subscribes the shared subscriber to the callback id itself, in addition to the
 * per-hostname channel it already listens on.
 *
 * A server running the previous release publishes responses to the callback id
 * verbatim rather than deriving the channel from it, so during a rolling deploy the
 * response to a request this process originated may arrive on either channel. This
 * adds a channel to the existing connection rather than a connection per request, so
 * the O(1) connection count is preserved.
 *
 * @param callbackId - The fully-qualified callback id to also listen on.
 */
export async function subscribeLegacyCallbackChannel(callbackId: string): Promise<void> {
  const subscriber = sharedSubscriber;
  assert(subscriber, 'Callback subscriber not yet initialized');
  await subscriber.subscribe(callbackId);
}

function unsubscribeLegacyCallbackChannel(callbackId: string): void {
  sharedSubscriber?.unsubscribe(callbackId).catch((err) => {
    globalLogger.warn('[AgentCallback]: Failed to unsubscribe callback channel', {
      error: normalizeErrorString(err),
    });
  });
}

/**
 * Removes a pending callback from the registry, cancelling its timer and dropping the
 * per-callback subscription.
 *
 * @param callbackId - The callback id to settle.
 * @returns The removed pending callback, or `undefined` if it had already settled.
 */
function settlePendingCallback(callbackId: string): PendingCallback | undefined {
  const pending = pendingCallbacks.get(callbackId);
  if (!pending) {
    return undefined;
  }
  pendingCallbacks.delete(callbackId);
  clearTimeout(pending.timer);
  unsubscribeLegacyCallbackChannel(callbackId);
  return pending;
}

/**
 * Throws if callback subscriber has not yet been initialized.
 */
export function assertCallbackSubscriber(): void {
  assert(sharedSubscriber, 'Callback subscriber not yet initialized');
}

/**
 * Ensures that a callback subscriber has been initialized and is listening for agent command callbacks.
 * @returns A Promise that resolves once the callback subscriber has initialized, or immediately if it was already initialized.
 */
export function ensureCallbackSubscriber(): Promise<void> {
  // On failure, reset so the next push retries -- otherwise a transient Redis error
  // would permanently prevent agent callbacks from being delivered. Also disconnect
  // the partially-created subscriber so a failed subscribe does not leak a connection.
  setupSubscriberPromise ??= setupCallbackSubscriber().catch((err) => {
    setupSubscriberPromise = undefined;
    sharedSubscriber?.disconnect();
    sharedSubscriber = undefined;
    throw err;
  });
  return setupSubscriberPromise;
}

async function setupCallbackSubscriber(): Promise<void> {
  const subscriber = getPubSubRedisSubscriber();
  sharedSubscriber = subscriber;
  subscriber.on('end', () => {
    // Only reset module state if this subscriber is still the current generation --
    // a stale end event from an already-replaced subscriber must not tear down its
    // successor. Clearing the setup promise lets the next push recreate the connection.
    if (sharedSubscriber === subscriber) {
      sharedSubscriber = undefined;
      setupSubscriberPromise = undefined;
    }
  });
  subscriber.on('message', (_channel: string, message: string) => {
    let parsed: AgentResponseMessage | AgentError;
    try {
      parsed = JSON.parse(message) as AgentResponseMessage | AgentError;
    } catch (err) {
      globalLogger.warn('[AgentCallback]: Failed to parse callback message', { error: normalizeErrorString(err) });
      return;
    }
    const callbackId = parsed.callback;
    if (!callbackId) {
      return;
    }
    const pending = settlePendingCallback(callbackId);
    if (!pending) {
      return;
    }
    pending.resolve([allOk, parsed]);
  });
  await subscriber.subscribe(getAgentCallbackChannel());
}

/**
 * Registers a pending callback and returns a promise that resolves with the agent
 * response once it arrives on the shared callback channel, or rejects on timeout.
 *
 * Requires {@link ensureCallbackSubscriber} to have run. Responses are demultiplexed
 * by callback id off the one subscriber this process holds, so connection count is
 * O(1) per server process rather than O(N) per in-flight push.
 *
 * @param callbackId - The fully-qualified callback id (see {@link buildAgentCallbackId}).
 * @param timeoutMs - Milliseconds to wait before rejecting with a timeout.
 * @returns The agent response (or error message) keyed by `callbackId`.
 */
export async function registerAgentCallback<T extends AgentResponseMessage = AgentResponseMessage>(
  callbackId: string,
  timeoutMs: number
): Promise<[OperationOutcome, T | AgentError]> {
  assertCallbackSubscriber();
  return new Promise<[OperationOutcome, T | AgentError]>((resolve, reject) => {
    const timer = setTimeout(() => {
      settlePendingCallback(callbackId);
      reject(new OperationOutcomeError(badRequest('Timeout')));
    }, timeoutMs);

    pendingCallbacks.set(callbackId, {
      resolve: resolve as PendingCallback['resolve'],
      reject,
      timer,
    });
  });
}

/**
 * Disconnects the shared agent callback subscriber and rejects any in-flight
 * callbacks. Safe to call when no subscriber has been created.
 */
export function closeAgentCallbackSubscriber(): void {
  for (const [, pending] of pendingCallbacks) {
    clearTimeout(pending.timer);
    pending.reject(new OperationOutcomeError(badRequest('Callback subscriber closed')));
  }
  pendingCallbacks.clear();
  setupSubscriberPromise = undefined;
  if (sharedSubscriber) {
    sharedSubscriber.disconnect();
    sharedSubscriber = undefined;
  }
}
