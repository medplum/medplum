// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentError, AgentResponseMessage } from '@medplum/core';
import { OperationOutcomeError, allOk, badRequest, normalizeErrorString } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { Redis } from 'ioredis';
import assert from 'node:assert';
import os from 'node:os';
import { globalLogger } from '../../../logger';
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
 * @returns The Redis channel to publish the response on.
 */
export function getCallbackChannelFromId(callback: string): string {
  const idx = callback.lastIndexOf(':');
  if (idx <= 0) {
    return callback;
  }
  return callback.slice(0, idx);
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
    const pending = pendingCallbacks.get(callbackId);
    if (!pending) {
      return;
    }
    pendingCallbacks.delete(callbackId);
    clearTimeout(pending.timer);
    pending.resolve([allOk, parsed]);
  });
  await subscriber.subscribe(getAgentCallbackChannel());
}

/**
 * Registers a pending callback and returns a promise that resolves with the agent
 * response once it arrives on the shared callback channel, or rejects on timeout.
 *
 * The first call lazily creates a single Redis subscriber for this process and
 * subscribes it to the hostname-keyed channel returned by {@link getAgentCallbackChannel}.
 * All subsequent calls reuse that subscriber, so connection count is O(1) per
 * server process rather than O(N) per in-flight push.
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
      pendingCallbacks.delete(callbackId);
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
