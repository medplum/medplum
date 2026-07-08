// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentError, AgentTransmitResponse } from '@medplum/core';
import { ContentType, allOk } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import type { MockInstance } from 'vitest';
import { loadTestConfig } from '../../../config/loader';
import type { MedplumServerConfig } from '../../../config/types';
import { globalLogger } from '../../../logger';
import { publish } from '../../../pubsub';
import * as redisModule from '../../../redis';
import { closeRedis, getPubSubRedisSubscriberCount, initRedis } from '../../../redis';
import {
  assertCallbackSubscriber,
  buildAgentCallbackId,
  closeAgentCallbackSubscriber,
  ensureCallbackSubscriber,
  getAgentCallbackChannel,
  getCallbackChannelFromId,
  registerAgentCallback,
} from './agentcallback';

type FakeSubscriber = EventEmitter & {
  subscribe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function makeFakeSubscriber(subscribeResult: Promise<number> = Promise.resolve(1)): FakeSubscriber {
  const fake = new EventEmitter() as FakeSubscriber;
  fake.subscribe = vi.fn().mockReturnValue(subscribeResult);
  fake.disconnect = vi.fn();
  return fake;
}

function makeTransmitResponse(callbackId: string): AgentTransmitResponse {
  return {
    type: 'agent:transmit:response',
    remote: '0.0.0.0:57000',
    contentType: ContentType.TEXT,
    statusCode: 200,
    body: 'PONG',
    callback: callbackId,
  };
}

describe('agentcallback', () => {
  describe('Channel and callback id helpers', () => {
    test('getAgentCallbackChannel is keyed off this hostname', () => {
      expect(getAgentCallbackChannel()).toStrictEqual(`agent:cb:${os.hostname()}`);
    });

    test('buildAgentCallbackId appends the uuid to the channel', () => {
      const uuid = randomUUID();
      expect(buildAgentCallbackId(uuid)).toStrictEqual(`${getAgentCallbackChannel()}:${uuid}`);
    });

    test('getCallbackChannelFromId round-trips a built callback id back to the channel', () => {
      const callbackId = buildAgentCallbackId(randomUUID());
      expect(getCallbackChannelFromId(callbackId)).toStrictEqual(getAgentCallbackChannel());
    });

    test('getCallbackChannelFromId strips only the last segment', () => {
      expect(getCallbackChannelFromId('agent:cb:some-host:1234')).toStrictEqual('agent:cb:some-host');
    });

    test('getCallbackChannelFromId returns legacy ids without a colon verbatim', () => {
      // Old-style callback ids (`Agent/<id>-<uuid>`) are themselves the channel name
      const legacyId = `Agent/${randomUUID()}-${randomUUID()}`;
      expect(getCallbackChannelFromId(legacyId)).toStrictEqual(legacyId);
    });

    test('getCallbackChannelFromId returns ids with a leading colon verbatim', () => {
      expect(getCallbackChannelFromId(':leading-colon')).toStrictEqual(':leading-colon');
    });

    test('getCallbackChannelFromId returns the empty string verbatim', () => {
      expect(getCallbackChannelFromId('')).toStrictEqual('');
    });
  });

  describe('Subscriber lifecycle', () => {
    let config: MedplumServerConfig;

    beforeAll(async () => {
      config = await loadTestConfig();
    });

    beforeEach(() => {
      initRedis(config);
    });

    afterEach(async () => {
      closeAgentCallbackSubscriber();
      vi.restoreAllMocks();
      await closeRedis();
    });

    test('registerAgentCallback throws when subscriber not yet initialized', async () => {
      await expect(registerAgentCallback('agent:cb:host:abc', 1000)).rejects.toThrow(
        'Callback subscriber not yet initialized'
      );
    });

    test('assertCallbackSubscriber throws before init and passes after', async () => {
      expect(() => assertCallbackSubscriber()).toThrow('Callback subscriber not yet initialized');
      await ensureCallbackSubscriber();
      expect(() => assertCallbackSubscriber()).not.toThrow();
    });

    test('closeAgentCallbackSubscriber is safe when never initialized', () => {
      expect(() => closeAgentCallbackSubscriber()).not.toThrow();
      // Safe to call repeatedly
      expect(() => closeAgentCallbackSubscriber()).not.toThrow();
    });

    test('resolves an in-flight callback when the response is published', async () => {
      await ensureCallbackSubscriber();
      const callbackId = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback<AgentTransmitResponse>(callbackId, 5000);

      const response = makeTransmitResponse(callbackId);
      // Publish on the channel derived from the id, exactly as ws/agent.ts does
      await publish(getCallbackChannelFromId(callbackId), JSON.stringify(response));

      await expect(resultPromise).resolves.toStrictEqual([allOk, response]);
    });

    test('resolves agent:error responses as well', async () => {
      await ensureCallbackSubscriber();
      const callbackId = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback(callbackId, 5000);

      const response: AgentError = { type: 'agent:error', body: 'Something is broken', callback: callbackId };
      await publish(getCallbackChannelFromId(callbackId), JSON.stringify(response));

      await expect(resultPromise).resolves.toStrictEqual([allOk, response]);
    });

    test('demultiplexes multiple in-flight callbacks on the shared channel', async () => {
      await ensureCallbackSubscriber();
      const callbackId1 = buildAgentCallbackId(randomUUID());
      const callbackId2 = buildAgentCallbackId(randomUUID());
      const resultPromise1 = registerAgentCallback<AgentTransmitResponse>(callbackId1, 5000);
      const resultPromise2 = registerAgentCallback<AgentTransmitResponse>(callbackId2, 5000);

      const response1 = makeTransmitResponse(callbackId1);
      const response2 = { ...makeTransmitResponse(callbackId2), body: 'PONG 2' };

      // Publish in reverse registration order to prove responses route by id, not order
      await publish(getAgentCallbackChannel(), JSON.stringify(response2));
      await publish(getAgentCallbackChannel(), JSON.stringify(response1));

      await expect(resultPromise1).resolves.toStrictEqual([allOk, response1]);
      await expect(resultPromise2).resolves.toStrictEqual([allOk, response2]);
    });

    test('reuses a single Redis subscriber across calls', async () => {
      const baseline = getPubSubRedisSubscriberCount();
      await Promise.all([ensureCallbackSubscriber(), ensureCallbackSubscriber()]);
      expect(getPubSubRedisSubscriberCount()).toStrictEqual(baseline + 1);
      await ensureCallbackSubscriber();
      expect(getPubSubRedisSubscriberCount()).toStrictEqual(baseline + 1);
    });

    test('rejects with Timeout when no response arrives, and ignores a late response', async () => {
      await ensureCallbackSubscriber();
      const callbackId = buildAgentCallbackId(randomUUID());
      await expect(registerAgentCallback(callbackId, 5)).rejects.toThrow('Timeout');

      // A response arriving after the timeout must not throw or resolve anything
      await publish(getCallbackChannelFromId(callbackId), JSON.stringify(makeTransmitResponse(callbackId)));

      // The subscriber must still work for new callbacks afterwards
      const callbackId2 = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback<AgentTransmitResponse>(callbackId2, 5000);
      const response2 = makeTransmitResponse(callbackId2);
      await publish(getCallbackChannelFromId(callbackId2), JSON.stringify(response2));
      await expect(resultPromise).resolves.toStrictEqual([allOk, response2]);
    });

    test('closeAgentCallbackSubscriber rejects in-flight callbacks', async () => {
      await ensureCallbackSubscriber();
      const resultPromise1 = registerAgentCallback(buildAgentCallbackId(randomUUID()), 5000);
      const resultPromise2 = registerAgentCallback(buildAgentCallbackId(randomUUID()), 5000);

      closeAgentCallbackSubscriber();

      await expect(resultPromise1).rejects.toThrow('Callback subscriber closed');
      await expect(resultPromise2).rejects.toThrow('Callback subscriber closed');
      expect(() => assertCallbackSubscriber()).toThrow('Callback subscriber not yet initialized');
    });

    test('recreates the subscriber after close', async () => {
      await ensureCallbackSubscriber();
      closeAgentCallbackSubscriber();

      await ensureCallbackSubscriber();
      const callbackId = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback<AgentTransmitResponse>(callbackId, 5000);
      const response = makeTransmitResponse(callbackId);
      await publish(getCallbackChannelFromId(callbackId), JSON.stringify(response));
      await expect(resultPromise).resolves.toStrictEqual([allOk, response]);
    });
  });

  describe('Message handling edge cases', () => {
    let fake: FakeSubscriber;

    beforeEach(async () => {
      fake = makeFakeSubscriber();
      vi.spyOn(redisModule, 'getPubSubRedisSubscriber').mockImplementation(
        () => fake as unknown as ReturnType<typeof redisModule.getPubSubRedisSubscriber>
      );
      await ensureCallbackSubscriber();
    });

    afterEach(() => {
      closeAgentCallbackSubscriber();
      vi.restoreAllMocks();
    });

    test('subscribes to the hostname-keyed channel', () => {
      expect(fake.subscribe).toHaveBeenCalledExactlyOnceWith(getAgentCallbackChannel());
    });

    test('logs a warning and keeps working when a message is not valid JSON', async () => {
      const warnSpy = vi.spyOn(globalLogger, 'warn').mockImplementation(() => undefined);
      const callbackId = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback<AgentTransmitResponse>(callbackId, 5000);

      fake.emit('message', getAgentCallbackChannel(), 'this is not JSON');
      expect(warnSpy).toHaveBeenCalledWith('[AgentCallback]: Failed to parse callback message', {
        error: expect.stringContaining('JSON'),
      });

      // The handler must survive the bad message and still resolve pending callbacks
      const response = makeTransmitResponse(callbackId);
      fake.emit('message', getAgentCallbackChannel(), JSON.stringify(response));
      await expect(resultPromise).resolves.toStrictEqual([allOk, response]);
    });

    test('ignores messages without a callback id', async () => {
      const callbackId = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback<AgentTransmitResponse>(callbackId, 5000);

      const withoutCallback = { ...makeTransmitResponse(callbackId), callback: undefined };
      fake.emit('message', getAgentCallbackChannel(), JSON.stringify(withoutCallback));

      // Pending callback is unaffected and still resolvable
      const response = makeTransmitResponse(callbackId);
      fake.emit('message', getAgentCallbackChannel(), JSON.stringify(response));
      await expect(resultPromise).resolves.toStrictEqual([allOk, response]);
    });

    test('ignores messages for unknown callback ids', async () => {
      const callbackId = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback<AgentTransmitResponse>(callbackId, 5000);

      const unknown = makeTransmitResponse(buildAgentCallbackId(randomUUID()));
      fake.emit('message', getAgentCallbackChannel(), JSON.stringify(unknown));

      const response = makeTransmitResponse(callbackId);
      fake.emit('message', getAgentCallbackChannel(), JSON.stringify(response));
      await expect(resultPromise).resolves.toStrictEqual([allOk, response]);
    });

    test('resolves a callback only once', async () => {
      const callbackId = buildAgentCallbackId(randomUUID());
      const resultPromise = registerAgentCallback<AgentTransmitResponse>(callbackId, 5000);

      const response = makeTransmitResponse(callbackId);
      fake.emit('message', getAgentCallbackChannel(), JSON.stringify(response));
      // A duplicate response for an already-resolved callback is ignored
      fake.emit('message', getAgentCallbackChannel(), JSON.stringify({ ...response, body: 'DUPLICATE' }));

      await expect(resultPromise).resolves.toStrictEqual([allOk, response]);
    });
  });

  describe('Failure and reconnect handling', () => {
    let subscriberSpy: MockInstance<typeof redisModule.getPubSubRedisSubscriber>;

    beforeEach(() => {
      subscriberSpy = vi.spyOn(redisModule, 'getPubSubRedisSubscriber');
    });

    afterEach(() => {
      closeAgentCallbackSubscriber();
      vi.restoreAllMocks();
    });

    function mockNextSubscriber(fake: FakeSubscriber): void {
      subscriberSpy.mockImplementationOnce(
        () => fake as unknown as ReturnType<typeof redisModule.getPubSubRedisSubscriber>
      );
    }

    test('failed subscribe disconnects the partial subscriber, resets state, and retries on next call', async () => {
      const failing = makeFakeSubscriber(Promise.reject(new Error('subscribe failed')));
      mockNextSubscriber(failing);

      await expect(ensureCallbackSubscriber()).rejects.toThrow('subscribe failed');
      expect(failing.disconnect).toHaveBeenCalledTimes(1);
      expect(() => assertCallbackSubscriber()).toThrow('Callback subscriber not yet initialized');

      // The next call must retry with a fresh subscriber rather than caching the failure
      const working = makeFakeSubscriber();
      mockNextSubscriber(working);
      await ensureCallbackSubscriber();
      expect(() => assertCallbackSubscriber()).not.toThrow();
      expect(working.subscribe).toHaveBeenCalledExactlyOnceWith(getAgentCallbackChannel());
    });

    test('concurrent calls during setup share a single subscriber', async () => {
      let resolveSubscribe: (value: number) => void = () => undefined;
      const pending = makeFakeSubscriber(
        new Promise<number>((resolve) => {
          resolveSubscribe = resolve;
        })
      );
      mockNextSubscriber(pending);

      const promise1 = ensureCallbackSubscriber();
      const promise2 = ensureCallbackSubscriber();
      expect(subscriberSpy).toHaveBeenCalledTimes(1);

      resolveSubscribe(1);
      await Promise.all([promise1, promise2]);
      expect(subscriberSpy).toHaveBeenCalledTimes(1);
    });

    test('end event on the current subscriber resets state so the next call reconnects', async () => {
      const first = makeFakeSubscriber();
      mockNextSubscriber(first);
      await ensureCallbackSubscriber();

      first.emit('end');
      expect(() => assertCallbackSubscriber()).toThrow('Callback subscriber not yet initialized');

      const second = makeFakeSubscriber();
      mockNextSubscriber(second);
      await ensureCallbackSubscriber();
      expect(() => assertCallbackSubscriber()).not.toThrow();
      expect(second.subscribe).toHaveBeenCalledExactlyOnceWith(getAgentCallbackChannel());
    });

    test('stale end event from a replaced subscriber does not tear down its successor', async () => {
      const first = makeFakeSubscriber();
      mockNextSubscriber(first);
      await ensureCallbackSubscriber();

      closeAgentCallbackSubscriber();
      expect(first.disconnect).toHaveBeenCalledTimes(1);

      const second = makeFakeSubscriber();
      mockNextSubscriber(second);
      await ensureCallbackSubscriber();

      // The old subscriber's end event arrives late, e.g. after its disconnect completes
      first.emit('end');

      // The successor must remain the active subscriber
      expect(() => assertCallbackSubscriber()).not.toThrow();
      await ensureCallbackSubscriber();
      expect(subscriberSpy).toHaveBeenCalledTimes(2);
    });
  });
});
