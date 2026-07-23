// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentMessage, AgentTransmitResponse } from '@medplum/core';
import { ContentType, TypedEventTarget } from '@medplum/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { App } from '../app';
import { createMockLogger, waitFor } from '../test-utils';
import { DurableQueue } from './durable-queue';
import type { InboundRow } from './types';
import { AckOutcome, ArBehavior, assertRowState, MessageState, QueueErrorCode } from './types';
import type { RetryPolicy } from './worker';
import { buildDispatchCallback, ChannelQueueWorker, computeRetryDelayMs, DEFAULT_RETRY_POLICY } from './worker';

/**
 * Stub App used by worker tests. Only the surface the worker touches is implemented;
 * everything else is intentionally absent so a slipped dependency surfaces as a clear
 * runtime error rather than silent behavior.
 *
 * `sent` plays the role of the real App's `webSocketQueue`: messages the stub has
 * accepted but (since the stub never sends) that remain "unsent" for the purposes
 * of `removeUnsentTransmit`. Tests that need to simulate a request that already
 * went out on the wire can clear/splice `sent` directly.
 * @param options - Stub options.
 * @param options.live - Initial `live` state (defaults to true).
 * @returns A minimal App stub, the captured WS messages, and a setter for the live flag.
 */
function makeStubApp(options?: { live?: boolean }): {
  app: App;
  sent: AgentMessage[];
  setLive: (live: boolean) => void;
} {
  const sent: AgentMessage[] = [];
  let live = options?.live ?? true;
  const stub = {
    agentId: 'agent-test',
    isLive: () => live,
    // The worker ties its in-flight lease check to the App heartbeat; tests fire it
    // by dispatching a 'heartbeat' event on this emitter.
    heartbeatEmitter: new TypedEventTarget(),
    addToWebSocketQueue: (msg: AgentMessage) => {
      sent.push(msg);
    },
    // `callbackId` here is the WIRE-level callback (row callbackId + attempt, see
    // buildDispatchCallback) — the same value the worker pushed onto `sent` and
    // later passes to removeUnsentTransmit, so a plain string match is correct.
    removeUnsentTransmit: (callbackId: string) => {
      const index = sent.findIndex((msg) => msg.type === 'agent:transmit:request' && msg.callback === callbackId);
      if (index === -1) {
        return false;
      }
      sent.splice(index, 1);
      return true;
    },
  };
  return {
    app: stub as unknown as App,
    sent,
    setLive: (value: boolean) => {
      live = value;
    },
  };
}

function enqueueOne(
  queue: DurableQueue,
  callbackId: string,
  body: string = 'MSH|^~\\&|...|2.5\r',
  enhancedMode: 'standard' | 'aaMode' | null = 'standard'
): InboundRow {
  const r = queue.enqueue({
    channelName: 'ch1',
    remote: '127.0.0.1:5000',
    msgControlId: callbackId,
    msgType: 'ADT^A01',
    originalMessage: Buffer.from(body),
    finalizedMessage: Buffer.from(body),
    encoding: 'utf-8',
    enhancedMode,
    callbackId,
    seqNo: null,
    receivedAt: Date.now(),
  });
  if (r.kind !== 'inserted') {
    throw new Error('expected inserted');
  }
  return r.row;
}

function makeResponse(callback: string, statusCode: number, body: string = 'MSH|...\rMSA|AA|x'): AgentTransmitResponse {
  return {
    type: 'agent:transmit:response',
    channel: 'ch1',
    remote: '127.0.0.1:5000',
    callback,
    contentType: ContentType.HL7_V2,
    statusCode,
    body,
  };
}

describe('ChannelQueueWorker', () => {
  let dir: string;
  let queue: DurableQueue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wq-test-'));
    queue = DurableQueue.open({ path: join(dir, 'queue.sqlite'), log: createMockLogger() });
  });

  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('processes queued rows in FIFO order with successful end-to-end ACK', async () => {
    const rows = ['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => enqueueOne(queue, id));
    const { app, sent } = makeStubApp();
    const sendAck = vi.fn(() => true);

    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck,
      responseTimeoutMs: 5000,
      idlePollMs: 10,
    });
    worker.start();

    // The worker dispatches one row at a time; satisfy each in order. Each row is
    // dispatched exactly once here, so its wire callback is always attempt 1.
    for (const row of rows) {
      const wireCallback = buildDispatchCallback(row.callbackId, 1);
      await waitFor(() => sent.length >= 1 && (sent.at(-1) as { callback?: string }).callback === wireCallback);
      worker.onServerResponse(makeResponse(wireCallback, 200));
      // Let the worker finish processing this row before the next dispatch.
      await waitFor(() => queue.getById(row.id)?.state === MessageState.PROCESSED);
    }

    expect(sendAck).toHaveBeenCalledTimes(5);
    expect(sent).toHaveLength(5);
    for (const row of rows) {
      expect(queue.getById(row.id)?.state).toBe(MessageState.PROCESSED);
    }
    await worker.stop();
  });

  test('steps down on its own when a peer steals the lease (idle: next claim throws)', async () => {
    // Bind the queue to "us" and take the lease so the worker is the leader.
    queue.setLeaseHolder('us');
    expect(queue.tryAcquireLease('us', 60_000)).toBe(true);

    const r1 = enqueueOne(queue, 'LD1');
    const { app, sent } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
    });
    worker.start();

    // Drains the first row normally while we hold the lease.
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r1.id)?.state === MessageState.PROCESSED);

    // A peer steals the lease. The idle worker's next claimNext throws
    // QueueLeaseError and it steps down on its own — no lost-leadership callback.
    queue.releaseLease('us');
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);
    await waitFor(() => !worker.isRunning(), 1000);

    // A row enqueued after the steal is never claimed by the demoted worker — it
    // never even reaches its first dispatch attempt.
    const r2 = enqueueOne(queue, 'LD2');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(queue.getById(r2.id)?.state).toBe(MessageState.QUEUED);
    expect(sent.some((m) => (m as { callback?: string }).callback === buildDispatchCallback(r2.callbackId, 1))).toBe(
      false
    );

    await worker.stop();
  });

  test('in-flight lease check (on heartbeat) cancels a wedged dispatch without settling the row', async () => {
    queue.setLeaseHolder('us');
    expect(queue.tryAcquireLease('us', 60_000)).toBe(true);

    const r1 = enqueueOne(queue, 'WD1');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
      responseTimeoutMs: 60_000, // long — the heartbeat check, not the timeout, must end the wait
    });
    worker.start();

    // Worker dispatches r1 and wedges awaiting a response that never comes.
    await waitFor(() => worker.hasInFlight());

    // Peer steals the lease. A heartbeat tick fires the in-flight lease check, which
    // cancels the wedged dispatch — well before the 60s response timeout.
    queue.releaseLease('us');
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);
    app.heartbeatEmitter.dispatchEvent({ type: 'heartbeat' });
    await waitFor(() => !worker.isRunning(), 1000);

    // The demoted worker did NOT settle the row — it's left for the new owner's
    // recoverOnStartup. (The stub app never calls markSent, so it's still `claimed`.)
    expect(queue.getById(r1.id)?.state).toBe(MessageState.CLAIMED);

    await worker.stop();
  });

  test('server 5xx marks the row failed (transient) and proceeds to the next', async () => {
    const r1 = enqueueOne(queue, 'E1');
    const r2 = enqueueOne(queue, 'E2');
    const { app } = makeStubApp();

    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
      // Auto-retry defaults to ON (guaranteed); opt out so the transient failure
      // settles terminally as `failed` for this classification test.
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
    });
    worker.start();

    await waitFor(() => pendingRowId(worker) === r1.id);
    worker.onServerResponse(makeResponse(currentCallback(worker), 503, 'service down'));

    await waitFor(() => queue.getById(r1.id)?.state === MessageState.FAILED);
    expect(queue.getById(r1.id)?.lastError).toContain('503');
    expect(queue.getById(r1.id)?.errorCode).toBe(QueueErrorCode.ServerError);
    // 5xx is a Bot-leg failure → no source ACK is owed.
    expect(queue.getById(r1.id)?.ackOutcome).toBe(AckOutcome.NOT_OWED);

    await waitFor(() => pendingRowId(worker) === r2.id);
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);

    await worker.stop();
  });

  test('server 4xx marks the row rejected (permanent) and proceeds to the next', async () => {
    const r1 = enqueueOne(queue, 'RJ1');
    const r2 = enqueueOne(queue, 'RJ2');
    const { app } = makeStubApp();

    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
      // Auto-retry off so the terminal classification is observed directly: a
      // transient 429 would otherwise be re-queued for retry, not left `failed`.
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
      // arBehavior=continue so the channel drains past the rejected r1 — the
      // default (pause) would halt the channel on r1's reject, and this test is
      // about the terminal classification of BOTH rows, not the pause gate.
      arBehavior: ArBehavior.CONTINUE,
    });
    worker.start();

    await waitFor(() => pendingRowId(worker) === r1.id);
    worker.onServerResponse(makeResponse(currentCallback(worker), 422, 'bad message'));

    await waitFor(() => queue.getById(r1.id)?.state === MessageState.REJECTED);
    expect(queue.getById(r1.id)?.errorCode).toBe(QueueErrorCode.ServerRejected);
    expect(queue.getById(r1.id)?.ackOutcome).toBe(AckOutcome.NOT_OWED);

    // 429 is the one 4xx that's transient → failed, not rejected.
    await waitFor(() => pendingRowId(worker) === r2.id);
    worker.onServerResponse(makeResponse(currentCallback(worker), 429, 'slow down'));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.FAILED);
    expect(queue.getById(r2.id)?.errorCode).toBe(QueueErrorCode.ServerRateLimited);

    await worker.stop();
  });

  test('sendAck returning false leaves the row processed with ack_outcome=undelivered', async () => {
    const r = enqueueOne(queue, 'A1');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => false,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    // The Bot accepted it (processed); only the source-leg ACK failed. No Bot-leg
    // error code is set — a closed source connection is never an upstream failure.
    expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
    expect(queue.getById(r.id)?.errorCode).toBeNull();
    await worker.stop();
  });

  test('aaMode suppresses the app-level ACK (commit AA already acknowledged the source)', async () => {
    // In aaMode the deferred-commit ACK already sent the source an AA at intake;
    // the Bot's app-level AA would be a redundant second AA the source (which closes
    // on ACK) is no longer listening for. The worker must NOT call sendAck, yet still
    // mark the row processed+delivered — the source was already acknowledged.
    const r = enqueueOne(queue, 'AA1', 'MSH|^~\\&|...|2.5\r', 'aaMode');
    const { app } = makeStubApp();
    const sendAck = vi.fn(() => true);
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    expect(sendAck).not.toHaveBeenCalled();
    expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.DELIVERED);
    expect(queue.getById(r.id)?.errorCode).toBeNull();
    await worker.stop();
  });

  test('sendAck throwing leaves the row processed+undelivered without crashing the loop', async () => {
    const r1 = enqueueOne(queue, 'T1');
    const r2 = enqueueOne(queue, 'T2');
    const { app } = makeStubApp();
    let throwOnce = true;
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('socket gone');
        }
        return true;
      },
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r1.id)?.state === MessageState.PROCESSED);
    expect(queue.getById(r1.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
    expect(queue.getById(r1.id)?.errorCode).toBeNull();

    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);
    expect(queue.getById(r2.id)?.ackOutcome).toBe(AckOutcome.DELIVERED);
    await worker.stop();
  });

  test('a failed source ACK (sendAck returns false) warns with the retransmit-replay recovery contract', async () => {
    // The ackOk=false branch of handleProcessed: the Bot accepted the message but
    // the app-level ACK could not be delivered to the source (a closed socket,
    // NOT a thrown send). The row is sound as processed+undelivered — never a
    // Bot-leg error — and the worker must emit the operator-facing recovery signal
    // (the row recovers only when the source retransmits and the stored ACK is
    // replayed, hl7.ts handleDuplicate). sendAck returned rather than threw, so
    // there is no error detail appended to the warning.
    const r = enqueueOne(queue, 'ACKWARN-FALSE');
    const { app } = makeStubApp();
    const log = createMockLogger();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log,
      sendAck: () => false,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);

    const warning = vi
      .mocked(log.warn)
      .mock.calls.map((c) => String(c[0]))
      .find((m) => m.includes('ACK delivery to source failed'));
    expect(warning).toBeDefined();
    expect(warning).toContain('awaiting source retransmit to replay');
    // sendAck returned false (no throw) → no error detail: the phrase reads
    // "...failed;" with the semicolon immediately after, not "...failed: <err>".
    expect(warning).toContain('ACK delivery to source failed;');
    await worker.stop();
  });

  test('a thrown source ACK (sendAck throws) warns with the thrown-error detail appended', async () => {
    // Same ackOk=false branch, but exercising the `ackError` sub-branch: when the
    // send THROWS (rather than returning false), relayAckToSource captures the
    // error and handleProcessed appends it to the warning as ": <detail>". The row
    // is still sound as processed+undelivered; the throw must not settle it as a
    // Bot-leg failure.
    const r = enqueueOne(queue, 'ACKWARN-THROW');
    const { app } = makeStubApp();
    const log = createMockLogger();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log,
      sendAck: () => {
        throw new Error('socket gone');
      },
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
    expect(queue.getById(r.id)?.errorCode).toBeNull();

    const warning = vi
      .mocked(log.warn)
      .mock.calls.map((c) => String(c[0]))
      .find((m) => m.includes('ACK delivery to source failed'));
    expect(warning).toBeDefined();
    // The thrown error is normalized and appended as a detail after a colon.
    expect(warning).toContain('ACK delivery to source failed:');
    expect(warning).toContain('socket gone');
    expect(warning).toContain('awaiting source retransmit to replay');
    await worker.stop();
  });

  test('markProcessed returning false (attempt superseded mid-handleProcessed) discards the write, leaving the row to the new owner', async () => {
    // The superseded-discard branch of handleProcessed. A peer can take the
    // dispatch lease and re-claim the row in the window between this worker's
    // server response arriving and its processed-state write. That write is
    // attempt-scoped (markProcessed guards on attempt_count), so when the attempt
    // has been superseded markProcessed returns false and handleProcessed must
    // discard: it must NOT stamp a stale `processed` over the peer's newer attempt,
    // and the ACK it already relayed is the new owner's business to reconcile.
    //
    // sendAck runs inside handleProcessed, BEFORE the markProcessed write — the
    // exact window a peer could supersede this attempt — so it is where we inject
    // the peer. We simulate the peer's takeover the only way the queue bumps an
    // attempt: requeue the in-flight attempt (attempt_count stays 1) then re-claim
    // it (attempt_count -> 2). The subsequent markProcessed(id, attempt=1) then
    // matches nothing and no-ops. (Assertions can't live inside sendAck: relayAck
    // ToSource wraps it in try/catch and would swallow a thrown expectation as an
    // ackError — so we capture the peer's results and assert them afterward.)
    const r = enqueueOne(queue, 'SUPERSEDE1');
    const { app } = makeStubApp();
    const log = createMockLogger();
    let superseded = false;
    let requeuedByPeer: boolean | undefined;
    let peerAttempt: number | undefined;
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log,
      sendAck: () => {
        if (!superseded) {
          superseded = true;
          requeuedByPeer = queue.scheduleRetry(
            r.id,
            1,
            'peer took over',
            QueueErrorCode.ServerError,
            Date.now() - 1000
          );
          peerAttempt = queue.claimNext('ch1')?.attemptCount;
        }
        return true;
      },
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));

    // handleProcessed observed markProcessed=false and logged the discard.
    await waitFor(() =>
      vi
        .mocked(log.info)
        .mock.calls.map((c) => String(c[0]))
        .some((m) => m.includes('processed-state write discarded'))
    );

    // The peer's takeover landed exactly as intended (guards the simulation itself).
    expect(requeuedByPeer).toBe(true);
    expect(peerAttempt).toBe(2);

    // The stale attempt-1 processed write was discarded: the row is NOT `processed`
    // — it stays where the peer left it, `claimed` on attempt 2, never overwritten.
    const after = queue.getById(r.id);
    assertRowState(after, MessageState.CLAIMED);
    expect(after.attemptCount).toBe(2);
    // markProcessed no-op'd, so our attempt never recorded a source-leg outcome;
    // the row still reads `pending` (its enqueue default), not delivered/undelivered.
    expect(after.ackOutcome).toBe(AckOutcome.PENDING);
    await worker.stop();
  });

  test('response timeout marks the row failed', async () => {
    const r = enqueueOne(queue, 'TIMEOUT');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 50,
      idlePollMs: 10,
      // Auto-retry off so the ambiguous timeout lands terminally in `failed`.
      // (Under the guaranteed default it would be retried — covered separately.)
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
    });
    worker.start();
    await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
    expect(queue.getById(r.id)?.lastError).toContain('Timed out');
    expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    await worker.stop();
  });

  test('late server response settles a timed-out row as processed', async () => {
    const r = enqueueOne(queue, 'LATE-OK');
    const { app } = makeStubApp();
    const sendAck = vi.fn(() => true);
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck,
      responseTimeoutMs: 50,
      idlePollMs: 10,
      // Opt out of auto-retry so the ambiguous response timeout lands in `failed`
      // for review — the precondition this late-ACK settlement exercises.
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
    });
    worker.start();
    await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
    expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    await worker.stop();

    // The server's response finally arrives, after the row already errored. The
    // server is authoritative on the Bot-leg outcome, so the row is settled from
    // it — not discarded and left for an ambiguous re-dispatch. The row was
    // dispatched exactly once (attempt 1) before it timed out.
    expect(worker.onServerResponse(makeResponse(buildDispatchCallback(r.callbackId, 1), 200))).toBe(true);

    const settled = queue.getById(r.id);
    expect(settled?.state).toBe(MessageState.PROCESSED);
    expect(settled?.serverStatusCode).toBe(200);
    expect(settled?.ackOutcome).toBe(AckOutcome.DELIVERED);
    expect(sendAck).toHaveBeenCalledTimes(1);
  });

  test('late server response settles a timed-out row as rejected on a permanent 4xx', async () => {
    const r = enqueueOne(queue, 'LATE-REJ');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 50,
      idlePollMs: 10,
      // Opt out of auto-retry so the ambiguous response timeout lands in `failed`
      // for review — the precondition this late-ACK settlement exercises.
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
    });
    worker.start();
    await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
    await worker.stop();

    expect(worker.onServerResponse(makeResponse(buildDispatchCallback(r.callbackId, 1), 422, 'bad message'))).toBe(
      true
    );
    const settled = queue.getById(r.id);
    expect(settled?.state).toBe(MessageState.REJECTED);
    expect(settled?.errorCode).toBe(QueueErrorCode.ServerRejected);
  });

  test('late server response is discarded when a peer took the lease (not ours to settle)', async () => {
    // Hold the lease so the worker is the leader, then let a row time out into `failed`.
    queue.setLeaseHolder('us');
    expect(queue.tryAcquireLease('us', 60_000)).toBe(true);

    const r = enqueueOne(queue, 'LATE-DEMOTED');
    const { app } = makeStubApp();
    const sendAck = vi.fn(() => true);
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck,
      responseTimeoutMs: 50,
      idlePollMs: 10,
      // Opt out of auto-retry so the ambiguous response timeout lands in `failed`
      // for review — the precondition this late-response/lease test exercises.
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
    });
    worker.start();
    await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
    expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    await worker.stop();

    // A peer steals the lease. The server's response then finally arrives — but this
    // row is now the new leader's to settle, not ours. applyServerResponse's write is
    // refused with QueueLeaseError, so the late response is discarded rather than
    // applied over a row a demoted process no longer owns.
    queue.releaseLease('us');
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);

    expect(worker.onServerResponse(makeResponse(buildDispatchCallback(r.callbackId, 1), 200))).toBe(false);

    // The row is left exactly as the timeout left it — no write leaked through the
    // lease gate (state, error code, and the still-null server status all unchanged).
    const row = queue.getById(r.id);
    expect(row?.state).toBe(MessageState.FAILED);
    expect(row?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    expect(row?.serverStatusCode).toBeNull();
    expect(sendAck).not.toHaveBeenCalled();
  });

  test('late duplicate server response is discarded for an already-settled row', async () => {
    const r = enqueueOne(queue, 'DUP');
    const { app } = makeStubApp();
    const sendAck = vi.fn(() => true);
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    await worker.stop();

    // A second response for the same attempt (e.g. a duplicate, or a NACK after
    // the row already succeeded) must not re-apply over the settled outcome.
    expect(worker.onServerResponse(makeResponse(buildDispatchCallback(r.callbackId, 1), 422))).toBe(false);
    expect(queue.getById(r.id)?.state).toBe(MessageState.PROCESSED);
    expect(sendAck).toHaveBeenCalledTimes(1);
  });

  test('onServerResponse for an unparseable callback returns false', () => {
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
    });
    expect(
      worker.onServerResponse({
        type: 'agent:transmit:response',
        channel: 'ch1',
        remote: 'r',
        callback: 'nope',
        contentType: ContentType.HL7_V2,
        statusCode: 200,
        body: '',
      })
    ).toBe(false);
  });

  test('onServerResponse for a well-formed but unknown callback returns false', () => {
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
    });
    expect(worker.onServerResponse(makeResponse(buildDispatchCallback('Agent/test-agent-unknown-row', 1), 200))).toBe(
      false
    );
  });

  test('stop drains and prevents further claims', async () => {
    const r = enqueueOne(queue, 'STOP1');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);

    await worker.stop();

    // Enqueue more after stop — they should NOT be claimed since the loop exited.
    enqueueOne(queue, 'STOP2');
    // Give the loop a chance to wake (it won't — stop set the flag).
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(queue.countByState().queued).toBe(1);
  });

  test('rows stay queued while the WebSocket is not live, then drain on reconnect', async () => {
    const r = enqueueOne(queue, 'OFFLINE1');
    const { app, sent, setLive } = makeStubApp({ live: false });
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 100,
      idlePollMs: 10,
    });
    worker.start();

    // Give the loop several ticks — nothing should be claimed or dispatched,
    // and crucially nothing should time out into `errored`.
    await sleepMs(100);
    expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);
    expect(queue.getById(r.id)?.attemptCount).toBe(0);
    expect(sent).toHaveLength(0);
    expect(worker.hasInFlight()).toBe(false);

    // Reconnect: the row dispatches and completes normally.
    setLive(true);
    worker.notify();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    await worker.stop();
  });

  test('disconnect with the transmit request still unsent requeues the row', async () => {
    const r = enqueueOne(queue, 'REQUEUE1');
    const { app, setLive } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 100,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    // The stub App never sends, so markSent never fires — the row sits in `claimed`
    // (worker owns it, request still buffered), exactly the state requeue targets.
    expect(queue.getById(r.id)?.state).toBe(MessageState.CLAIMED);

    // Connection drops before the request left the WS queue.
    setLive(false);
    worker.onWebSocketDisconnect();

    expect(worker.hasInFlight()).toBe(false);
    expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);
    // The dispatch never left the process, so it doesn't count as an attempt.
    expect(queue.getById(r.id)?.attemptCount).toBe(0);

    // Outlive the original response timeout — the row must NOT become errored.
    await sleepMs(150);
    expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);

    // Reconnect: the same row is re-claimed and completes.
    setLive(true);
    worker.notify();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(currentCallback(worker), 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    await worker.stop();
  });

  test('disconnect after the transmit request was sent leaves the row to the response timeout', async () => {
    const r = enqueueOne(queue, 'SENT1');
    const { app, sent, setLive } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 50,
      idlePollMs: 10,
      // Normal mode isolates the disconnect semantics under test: the worker must
      // not requeue an already-sent request, and the ambiguous timeout then lands
      // terminally in `failed`. (Under the guaranteed default that timeout would
      // be retried instead — covered by the guaranteed-delivery tests.)
      retryPolicy: { ...DEFAULT_RETRY_POLICY, guaranteedDelivery: false },
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());

    // Simulate the request having gone out on the wire: it's no longer in the
    // WS queue, so removeUnsentTransmit can't find it.
    sent.length = 0;
    setLive(false);
    worker.onWebSocketDisconnect();

    // Ambiguous delivery — the worker must not requeue; the timeout fails it.
    expect(worker.hasInFlight()).toBe(true);
    await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
    expect(queue.getById(r.id)?.lastError).toContain('Timed out');
    expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    await worker.stop();
  });

  test('onWebSocketDisconnect with nothing in flight is a no-op', () => {
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
    });
    expect(() => worker.onWebSocketDisconnect()).not.toThrow();
  });

  test('under the default (guaranteed) policy, a response timeout is retried, not failed', async () => {
    const r = enqueueOne(queue, 'DEFAULT-TIMEOUT');
    const { app } = makeStubApp();
    // No retryPolicy → DEFAULT_RETRY_POLICY, which is guaranteedDelivery. An
    // ambiguous response timeout is retried (returned to `queued`) rather than
    // left `failed` — the at-least-once default. (Normal-mode opt-out, which DOES
    // land such a timeout in `failed` for review, is covered separately above.)
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 50,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED, 2000);
    const scheduled = queue.getById(r.id);
    assertRowState(scheduled, MessageState.QUEUED);
    expect(scheduled.lastError).toContain('Timed out');
    expect(scheduled.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    expect(scheduled.nextAttemptAt).toBeGreaterThan(0);
    await worker.stop();
  });

  describe('auto-retry', () => {
    // Multiplier 1 keeps the deterministic backoff at baseDelayMs; equal jitter then
    // lands each delay in [baseDelayMs/2, baseDelayMs]. Kept small so retries fire
    // promptly and the tests stay fast. Jitter itself is covered by the
    // computeRetryDelayMs unit tests.
    const fastRetryPolicy: RetryPolicy = {
      enabled: true,
      guaranteedDelivery: false,
      baseDelayMs: 20,
      maxDelayMs: 100,
      maxAttempts: 3,
      backoffMultiplier: 1,
    };

    function makeWorker(app: App, sendAck: () => boolean, policy?: Partial<RetryPolicy>): ChannelQueueWorker {
      return new ChannelQueueWorker({
        channelName: 'ch1',
        app,
        queue,
        log: createMockLogger(),
        sendAck,
        responseTimeoutMs: 5000,
        idlePollMs: 10,
        retryPolicy: { ...fastRetryPolicy, ...policy },
      });
    }

    test('server 5xx schedules a retry and the row succeeds on the next attempt', async () => {
      const r = enqueueOne(queue, 'RETRY1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true);
      worker.start();

      await waitFor(() => worker.hasInFlight());
      const before = Date.now();
      worker.onServerResponse(makeResponse(currentCallback(worker), 503, 'service down'));

      // The row returns to queued (not errored) with retry metadata.
      await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
      const scheduled = queue.getById(r.id);
      assertRowState(scheduled, MessageState.QUEUED);
      expect(scheduled.errorCode).toBe(QueueErrorCode.ServerError);
      expect(scheduled.lastError).toContain('503');
      // Equal jitter floors the delay at half the computed backoff.
      expect(scheduled.nextAttemptAt).toBeGreaterThanOrEqual(before + fastRetryPolicy.baseDelayMs / 2);

      // After the backoff, the worker re-claims the same row; succeed it.
      await waitFor(() => worker.hasInFlight(), 2000);
      worker.onServerResponse(makeResponse(currentCallback(worker), 200));
      await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
      expect(queue.getById(r.id)?.attemptCount).toBe(2);
      await worker.stop();
    });

    test('429 is retryable; other 4xx is terminal with server-rejected', async () => {
      const r429 = enqueueOne(queue, 'RL1');
      const r400 = enqueueOne(queue, 'BAD1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true);
      worker.start();

      await waitFor(() => pendingRowId(worker) === r429.id);
      worker.onServerResponse(makeResponse(currentCallback(worker), 429, 'slow down'));
      await waitFor(() => queue.getById(r429.id)?.state === MessageState.QUEUED);
      expect(queue.getById(r429.id)?.errorCode).toBe(QueueErrorCode.ServerRateLimited);

      // The retrying row blocks the channel head-of-line; satisfy it first.
      await waitFor(() => pendingRowId(worker) === r429.id, 2000);
      worker.onServerResponse(makeResponse(currentCallback(worker), 200));
      await waitFor(() => queue.getById(r429.id)?.state === MessageState.PROCESSED);

      // A non-429 4xx never retries, even with the policy enabled — it's a
      // permanent reject (`rejected`), not the retry/review `failed` bucket.
      await waitFor(() => pendingRowId(worker) === r400.id, 2000);
      worker.onServerResponse(makeResponse(currentCallback(worker), 400, 'bad message'));
      await waitFor(() => queue.getById(r400.id)?.state === MessageState.REJECTED);
      expect(queue.getById(r400.id)?.errorCode).toBe(QueueErrorCode.ServerRejected);
      await worker.stop();
    });

    test('a retryable failure becomes terminal once maxAttempts is exhausted', async () => {
      const r = enqueueOne(queue, 'EXHAUST1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true, { maxAttempts: 2 });
      worker.start();

      for (let attempt = 1; attempt <= 2; attempt++) {
        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(currentCallback(worker), 503, 'still down'));
        await waitFor(() => queue.getById(r.id)?.state !== MessageState.CLAIMED);
      }

      const final = queue.getById(r.id);
      // ServerError is transient, not permanent — exhausted retries land in `failed`
      // (the review bucket), never `rejected`.
      expect(final?.state).toBe(MessageState.FAILED);
      expect(final?.attemptCount).toBe(2);
      expect(final?.errorCode).toBe(QueueErrorCode.ServerError);
      expect(final?.lastError).toContain('2 attempts exhausted');
      await worker.stop();
    });

    test('an ambiguous response timeout is NOT retried in normal mode — left failed for review', async () => {
      const r = enqueueOne(queue, 'AMBIG1');
      const { app } = makeStubApp();
      const worker = new ChannelQueueWorker({
        channelName: 'ch1',
        app,
        queue,
        log: createMockLogger(),
        sendAck: () => true,
        responseTimeoutMs: 50,
        idlePollMs: 10,
        retryPolicy: fastRetryPolicy,
      });
      worker.start();
      // The timeout is an ambiguous failure: the server may have processed the
      // message, so even with auto-retry enabled it must NOT be re-dispatched —
      // it lands in `failed` for an operator to decide. This is the core of the
      // transient-vs-ambiguous gating.
      await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
      expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
      expect(queue.getById(r.id)?.attemptCount).toBe(1);
      await worker.stop();
    });

    describe('guaranteed delivery', () => {
      const guaranteedPolicy: RetryPolicy = { ...fastRetryPolicy, guaranteedDelivery: true, maxAttempts: 0 };

      function makeAckBody(ackCode: string, controlId: string = 'X1'): string {
        return `MSH|^~\\&|MEDPLUM|MEDPLUM|TEST|TEST|20240101000000||ACK|${controlId}|P|2.5.1\rMSA|${ackCode}|${controlId}`;
      }

      test('response timeout is retried until upstream answers', async () => {
        const r = enqueueOne(queue, 'GD-TIMEOUT');
        const { app } = makeStubApp();
        const worker = new ChannelQueueWorker({
          channelName: 'ch1',
          app,
          queue,
          log: createMockLogger(),
          sendAck: () => true,
          responseTimeoutMs: 50,
          idlePollMs: 10,
          retryPolicy: guaranteedPolicy,
        });
        worker.start();

        // The first dispatch times out — ambiguous, but guaranteed mode retries it.
        await waitFor(() => queue.getById(r.id)?.errorCode === QueueErrorCode.ResponseTimeout, 2000);
        expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);

        // Answer the next dispatch definitively.
        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(currentCallback(worker), 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        await worker.stop();
      });

      test('HTTP 4xx without a definitive ACK is retried', async () => {
        const r = enqueueOne(queue, 'GD-400');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(currentCallback(worker), 400, 'not an hl7 ack'));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ServerRejected);

        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(currentCallback(worker), 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        expect(queue.getById(r.id)?.attemptCount).toBe(2);
        await worker.stop();
      });

      test.each(['AR', 'CR'])('upstream %s is a definitive reject — terminal, no retry', async (ackCode) => {
        const r = enqueueOne(queue, `GD-${ackCode}`);
        const { app } = makeStubApp();
        const sendAck = vi.fn(() => true);
        const worker = makeWorker(app, sendAck, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(currentCallback(worker), 400, makeAckBody(ackCode)));
        // A definitive upstream reject is permanent → `rejected`, never retried.
        await waitFor(() => queue.getById(r.id)?.state === MessageState.REJECTED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.UpstreamRejected);
        expect(queue.getById(r.id)?.attemptCount).toBe(1);
        // This IS the Bot's real application-level answer (a definitive reject),
        // so — unlike a transport/HTTP-leg failure — it is relayed to the source.
        expect(sendAck).toHaveBeenCalledTimes(1);
        expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.DELIVERED);
        await worker.stop();
      });

      test('upstream AE retries until a definitive AA arrives', async () => {
        const r = enqueueOne(queue, 'GD-AE');
        const { app } = makeStubApp();
        const sendAck = vi.fn(() => true);
        const worker = makeWorker(app, sendAck, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(currentCallback(worker), 200, makeAckBody('AE')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.UpstreamError);
        // Not a definitive answer — never relayed, so a later AA isn't contradicted.
        expect(sendAck).not.toHaveBeenCalled();

        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(currentCallback(worker), 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        expect(sendAck).toHaveBeenCalledTimes(1);
        await worker.stop();
      });

      test('a late success for a superseded attempt is discarded; the current attempt still fails/retries normally', async () => {
        // Attempt 1 times out locally and is retried; attempt 2 is dispatched.
        // THEN attempt 1's response finally arrives from the server — a success.
        // It must be discarded (the row has moved on to attempt 2), not applied
        // as if it settled the row. Attempt 2 subsequently fails for real, which
        // must be handled exactly as any other failure, unaffected by the stale
        // attempt-1 response that was just discarded.
        const r = enqueueOne(queue, 'GD-STALE-SUCCESS');
        const { app } = makeStubApp();
        const sendAck = vi.fn(() => true);
        const worker = makeWorker(app, sendAck, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        const attempt1Callback = currentCallback(worker);
        worker.onServerResponse(makeResponse(attempt1Callback, 503, 'service down'));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);

        // Attempt 2 is claimed and dispatched before attempt 1's (delayed) response
        // shows up.
        await waitFor(() => worker.hasInFlight(), 2000);
        expect(currentCallback(worker)).not.toBe(attempt1Callback);

        // The late attempt-1 success arrives now — discarded as stale, since it
        // answers an attempt the row has already moved past.
        expect(worker.onServerResponse(makeResponse(attempt1Callback, 200, makeAckBody('AA')))).toBe(false);
        expect(queue.getById(r.id)?.state).toBe(MessageState.CLAIMED);
        expect(sendAck).not.toHaveBeenCalled();

        // Attempt 2 then fails for real — scheduled for retry like any other
        // transient failure, with no trace of the discarded attempt-1 response.
        worker.onServerResponse(makeResponse(currentCallback(worker), 503, 'still down'));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
        const scheduled = queue.getById(r.id);
        expect(scheduled?.errorCode).toBe(QueueErrorCode.ServerError);
        expect(scheduled?.attemptCount).toBe(2);
        expect(scheduled?.lastError).toContain('still down');
        await worker.stop();
      });

      test('source ACK failure is processed+undelivered, never re-dispatched — even under guaranteed delivery', async () => {
        // Guaranteed delivery retries Bot-leg failures, but a failed SOURCE ACK is
        // not a Bot-leg failure: upstream already accepted the message (AA). The
        // row settles `processed` + `undelivered` and is never re-dispatched (that
        // would double-process); it recovers via a source retransmit (Path-1).
        const r = enqueueOne(queue, 'GD-ACKFAIL');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => false, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(currentCallback(worker), 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
        expect(queue.getById(r.id)?.errorCode).toBeNull();
        expect(queue.getById(r.id)?.attemptCount).toBe(1);
        await worker.stop();
      });

      test('worker stop schedules a retry instead of erroring the in-flight row', async () => {
        const r = enqueueOne(queue, 'GD-STOP');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        await worker.stop();

        expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.WorkerStopped);
      });

      test('explicit maxAttempts caps guaranteed-mode retries', async () => {
        const r = enqueueOne(queue, 'GD-CAP');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 2 });
        worker.start();

        for (let attempt = 1; attempt <= 2; attempt++) {
          await waitFor(() => worker.hasInFlight(), 2000);
          worker.onServerResponse(makeResponse(currentCallback(worker), 200, makeAckBody('AE')));
          await waitFor(() => queue.getById(r.id)?.state !== MessageState.CLAIMED);
        }

        const final = queue.getById(r.id);
        // UpstreamError (AE/CE) is not a permanent reject → exhausted retries land
        // in `failed`, not `rejected`.
        expect(final?.state).toBe(MessageState.FAILED);
        expect(final?.errorCode).toBe(QueueErrorCode.UpstreamError);
        expect(final?.lastError).toContain('2 attempts exhausted');
        await worker.stop();
      });
    });

    test('setRetryPolicy applies to subsequent failures', async () => {
      const r = enqueueOne(queue, 'SWAP1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true, { enabled: false });
      worker.setRetryPolicy(fastRetryPolicy);
      worker.start();

      await waitFor(() => worker.hasInFlight());
      worker.onServerResponse(makeResponse(currentCallback(worker), 503, 'down'));
      await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
      expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ServerError);

      await waitFor(() => worker.hasInFlight(), 2000);
      worker.onServerResponse(makeResponse(currentCallback(worker), 200));
      await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
      await worker.stop();
    });
  });

  describe('arBehavior', () => {
    // An HL7 ACK body carrying the given MSA-1 code (guaranteed mode reads this,
    // not the HTTP status). 'AR' is a definitive upstream reject → terminal `rejected`.
    const ackBody = (code: string): string =>
      `MSH|^~\\&|MEDPLUM|MEDPLUM|TEST|TEST|20240101000000||ACK|X1|P|2.5.1\rMSA|${code}|X1`;

    test('default (pause): an upstream AR halts the channel until the rejected row is cleared', async () => {
      const r1 = enqueueOne(queue, 'AR-PAUSE-1');
      const r2 = enqueueOne(queue, 'AR-PAUSE-2');
      const { app } = makeStubApp();
      // No arBehavior option → defaults to pause. Default retry policy is guaranteed,
      // under which an upstream AR is the one terminal `rejected` outcome.
      const worker = new ChannelQueueWorker({
        channelName: 'ch1',
        app,
        queue,
        log: createMockLogger(),
        sendAck: () => true,
        idlePollMs: 10,
      });
      worker.start();

      await waitFor(() => pendingRowId(worker) === r1.id);
      worker.onServerResponse(makeResponse(currentCallback(worker), 400, ackBody('AR')));
      await waitFor(() => queue.getById(r1.id)?.state === MessageState.REJECTED);
      expect(queue.getById(r1.id)?.errorCode).toBe(QueueErrorCode.UpstreamRejected);

      // The pipe is paused: r2 is never claimed while the reject stands, even
      // after ample time for several idle-poll ticks.
      await sleepMs(80);
      expect(queue.getById(r2.id)?.state).toBe(MessageState.QUEUED);
      expect(worker.hasInFlight()).toBe(false);

      // Operator clears the reject (here: reclassify its state). The channel then
      // resumes automatically on the next claim — no restart needed.
      queue.getDb().prepare("UPDATE inbound_hl7_messages SET state = 'processed' WHERE id = ?").run(r1.id);
      worker.notify();
      await waitFor(() => pendingRowId(worker) === r2.id);
      worker.onServerResponse(makeResponse(currentCallback(worker), 200, ackBody('AA')));
      await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);

      await worker.stop();
    });

    test('continue: a rejected message does not stall the channel', async () => {
      const r1 = enqueueOne(queue, 'AR-CONT-1');
      const r2 = enqueueOne(queue, 'AR-CONT-2');
      const { app } = makeStubApp();
      const worker = new ChannelQueueWorker({
        channelName: 'ch1',
        app,
        queue,
        log: createMockLogger(),
        sendAck: () => true,
        idlePollMs: 10,
        arBehavior: ArBehavior.CONTINUE,
      });
      worker.start();

      await waitFor(() => pendingRowId(worker) === r1.id);
      worker.onServerResponse(makeResponse(currentCallback(worker), 400, ackBody('AR')));
      await waitFor(() => queue.getById(r1.id)?.state === MessageState.REJECTED);

      // With continue, the worker drains straight past the rejected r1 to r2.
      await waitFor(() => pendingRowId(worker) === r2.id);
      worker.onServerResponse(makeResponse(currentCallback(worker), 200, ackBody('AA')));
      await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);

      await worker.stop();
    });

    test('setArBehavior(continue) resumes a channel paused on a reject', async () => {
      const r1 = enqueueOne(queue, 'AR-SWITCH-1');
      const r2 = enqueueOne(queue, 'AR-SWITCH-2');
      const { app } = makeStubApp();
      const worker = new ChannelQueueWorker({
        channelName: 'ch1',
        app,
        queue,
        log: createMockLogger(),
        sendAck: () => true,
        idlePollMs: 10,
        arBehavior: ArBehavior.PAUSE,
      });
      worker.start();

      await waitFor(() => pendingRowId(worker) === r1.id);
      worker.onServerResponse(makeResponse(currentCallback(worker), 400, ackBody('AR')));
      await waitFor(() => queue.getById(r1.id)?.state === MessageState.REJECTED);

      await sleepMs(50);
      expect(queue.getById(r2.id)?.state).toBe(MessageState.QUEUED);

      // Flip the channel to continue (as a config reload would) — the pause lifts
      // and draining resumes past the still-`rejected` r1.
      worker.setArBehavior(ArBehavior.CONTINUE);
      worker.notify();
      await waitFor(() => pendingRowId(worker) === r2.id);
      worker.onServerResponse(makeResponse(currentCallback(worker), 200, ackBody('AA')));
      await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);
      // r1 stays rejected — continue does not un-reject it, it just stops gating.
      expect(queue.getById(r1.id)?.state).toBe(MessageState.REJECTED);

      await worker.stop();
    });
  });
});

describe('computeRetryDelayMs', () => {
  const policy: RetryPolicy = {
    enabled: true,
    guaranteedDelivery: false,
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
    maxAttempts: 0,
    backoffMultiplier: 2,
  };

  // Equal jitter is non-deterministic (uses Math.random internally), so assert the
  // band [capped/2, capped] rather than exact values. The deterministic exponential
  // schedule is the upper edge: capped = min(maxDelayMs, baseDelayMs * mult^(n-1)).
  const cappedFor = (p: RetryPolicy, n: number): number =>
    Math.min(p.maxDelayMs, p.baseDelayMs * p.backoffMultiplier ** (n - 1));

  function expectInBand(p: RetryPolicy, n: number): void {
    const capped = cappedFor(p, n);
    for (let i = 0; i < 200; i++) {
      const delay = computeRetryDelayMs(p, n);
      expect(delay).toBeGreaterThanOrEqual(capped / 2);
      expect(delay).toBeLessThanOrEqual(capped);
      // Must be a whole millisecond: it is added to Date.now() and written to the
      // INTEGER next_attempt_at column of a STRICT table, which rejects fractional
      // REAL values at bind time (a fractional delay would crash the worker loop).
      expect(Number.isInteger(delay)).toBe(true);
    }
  }

  test('the deterministic backoff (jitter band upper edge) grows exponentially', () => {
    expect(cappedFor(policy, 1)).toBe(1000);
    expect(cappedFor(policy, 2)).toBe(2000);
    expect(cappedFor(policy, 3)).toBe(4000);
    expect(cappedFor(policy, 5)).toBe(16000);
  });

  test('equal jitter keeps each delay in [capped/2, capped]', () => {
    for (let attempt = 1; attempt <= 8; attempt++) {
      expectInBand(policy, attempt);
    }
  });

  test('caps at maxDelayMs (band [maxDelayMs/2, maxDelayMs])', () => {
    expect(cappedFor(policy, 7)).toBe(60_000);
    expectInBand(policy, 7);
    expectInBand(policy, 50);
  });

  test('multiplier 1 jitters around a fixed base', () => {
    const fixed = { ...policy, backoffMultiplier: 1 };
    expect(cappedFor(fixed, 10)).toBe(1000);
    expectInBand(fixed, 1);
    expectInBand(fixed, 10);
  });
});

/**
 * @param worker - The worker under test.
 * @returns The wire-level callback of whatever dispatch is currently pending, if any.
 */
function lastCallback(worker: ChannelQueueWorker): string | undefined {
  return (worker as unknown as { pending?: { wireCallback: string } }).pending?.wireCallback;
}

/**
 * @param worker - The worker under test.
 * @returns The id of the row currently pending a response, if any — used to disambiguate between rows in flight sequentially.
 */
function pendingRowId(worker: ChannelQueueWorker): number | undefined {
  return (worker as unknown as { pending?: { row: InboundRow } }).pending?.row.id;
}

/**
 * Like {@link lastCallback}, but throws if nothing is pending — for call sites that need a definite `string`.
 * @param worker - The worker under test.
 * @returns The wire-level callback of the currently pending dispatch.
 */
function currentCallback(worker: ChannelQueueWorker): string {
  const cb = lastCallback(worker);
  if (!cb) {
    throw new Error('expected an in-flight dispatch');
  }
  return cb;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
