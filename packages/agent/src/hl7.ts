// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AckCode, AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, Hl7Message, normalizeErrorString } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import type { EnhancedMode, Hl7Connection, Hl7ErrorEvent, Hl7MessageEvent } from '@medplum/hl7';
import { Hl7EnhancedAckSentEvent, Hl7Server } from '@medplum/hl7';
import { randomUUID } from 'node:crypto';
import type { App } from './app';
import { BaseChannel } from './channel';
import { ChannelStatsTracker } from './channel-stats-tracker';
import type { LogicalChannelField } from './logical-channel';
import { computeLogicalChannelKey, parseLogicalChannelKeySpec } from './logical-channel';
import type { DurableQueue } from './queue/durable-queue';
import type { EnqueueResult, InboundRow } from './queue/types';
import { AckOutcome, DuplicateBehavior, QueueErrorCode, SETTLED_MESSAGE_STATES } from './queue/types';
import type { AgentRetryDefaults, RetryMode, RetryPolicy } from './queue/worker';
import {
  ChannelQueueWorker,
  DEFAULT_NORMAL_MODE_MAX_ATTEMPTS,
  DEFAULT_RETRY_MODE,
  DEFAULT_RETRY_POLICY,
  isRetryMode,
} from './queue/worker';
import { getCurrentStats, updateStat } from './stats';

/**
 * Valid values for the appLevelAck query parameter.
 * Based on MSH-16 (Application Acknowledgment Type) in the HL7v2 specification.
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Fields/MSH-16
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Tables/0155
 */
export const APP_LEVEL_ACK_MODES = ['AL', 'ER', 'NE', 'SU'] as const;
export type AppLevelAckMode = (typeof APP_LEVEL_ACK_MODES)[number];
export const APP_LEVEL_ACK_CODES = ['AA', 'AE', 'AR'] as const;
export type AppLevelAckCode = (typeof APP_LEVEL_ACK_CODES)[number];

export interface ShouldSendAppLevelAckOptions {
  mode: AppLevelAckMode;
  ackCode: AppLevelAckCode;
  enhancedMode: EnhancedMode;
}

/**
 * Negative commit-ACK code the durable path sends via {@link AgentHl7ChannelConnection.sendCommitNack}.
 *
 * By HL7 convention the *error* codes invite a retransmit (the peer may retry and
 * could succeed) while the *reject* codes are terminal (retransmitting the same
 * message fails identically, so the peer must not retry):
 *
 * - `CE` — Commit Error (standard enhanced): e.g. a transient storage failure.
 * - `AE` — Application Error (aaMode).
 * - `CR` — Commit Reject (standard enhanced): e.g. a rejected duplicate.
 * - `AR` — Application Reject (aaMode).
 */
export type NackCommitCode = 'CR' | 'CE' | 'AR' | 'AE';

export class AgentHl7Channel extends BaseChannel {
  readonly server: Hl7Server;
  private started = false;
  readonly connections = new Map<string, AgentHl7ChannelConnection>();
  readonly log: ILogger;
  readonly channelLog: ILogger;
  private prefix: string;
  stats: ChannelStatsTracker;
  private appLevelAckMode: AppLevelAckMode = 'AL'; // Default app level ack mode is AL (Always)
  private assignSeqNo: boolean = false;
  private lastSeqNo = -1;
  private duplicateBehavior: DuplicateBehavior = DuplicateBehavior.IDEMPOTENT;
  private retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY;
  // The channel's own copy of the enhanced mode, parsed from the endpoint URL.
  // In durable mode this is intentionally NOT pushed onto the Hl7Connection (so
  // the connection's synchronous auto-ACK stays off and the agent can defer the
  // commit ACK until after the DB write); the connection therefore can't be the
  // source of truth, so we track it here and the durable path reads it directly.
  private enhancedMode: EnhancedMode = undefined;
  /**
   * Bounded pool of workers draining this channel's durable queue. Each worker is
   * an ordinary single-in-flight {@link ChannelQueueWorker}; concurrency comes
   * from running several of them, and the partition-aware claim (see CLAIM_NEXT)
   * guarantees at most one ever holds a given logical channel in flight. Sized to
   * {@link maxWorkers} (default 1 = the pre-logical-channel single-worker behavior).
   */
  workers: ChannelQueueWorker[] = [];
  /**
   * Excess workers removed from {@link workers} by a pool shrink that are still
   * draining their in-flight dispatch ({@link resizeWorkerPool} calls
   * `stop({ drain: true })`). They must stay reachable until they settle: a
   * server response or a WS disconnect for their in-flight row still has to reach
   * them (see {@link allWorkers}), or the drain drops it. Each removes itself once
   * its `stop()` resolves.
   */
  private drainingWorkers: ChannelQueueWorker[] = [];
  /**
   * Every worker that may still own an in-flight dispatch: the active pool plus
   * any still draining after a shrink. Response routing ({@link routeServerResponse})
   * and WS-disconnect handling must consult BOTH — a worker spliced out of
   * {@link workers} but still awaiting its server response is otherwise
   * unreachable, so its response is dropped (spurious failure / duplicate dispatch).
   * @returns The active pool plus any workers still draining after a shrink.
   */
  get allWorkers(): ChannelQueueWorker[] {
    return this.drainingWorkers.length === 0 ? this.workers : [...this.workers, ...this.drainingWorkers];
  }
  /** Max concurrent workers in {@link workers}; resolved from config (default 1). */
  private maxWorkers = 1;
  /** Parsed `logicalChannelKey` spec used to partition inbound messages; `[]` = single queue. */
  private logicalChannelKeySpec: LogicalChannelField[] = [];
  /**
   * The raw `logicalChannelKey` spec string currently applied to the queue.
   * Compared on reload to decide whether to recompute already-queued rows. Starts
   * `''` (the default) so an unchanged default channel never triggers a recompute.
   */
  private appliedLogicalChannelKeyRaw = '';

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    this.server = new Hl7Server((connection: Hl7Connection) => this.handleNewConnection(connection));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.prefix = `[HL7:${definition.name}] `;
    this.log = app.log.clone({ options: { prefix: this.prefix } });
    this.channelLog = app.channelLog.clone({ options: { prefix: this.prefix } });
    this.stats = new ChannelStatsTracker({ heartbeatEmitter: app.heartbeatEmitter, log: this.log });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    const address = new URL(this.getEndpoint().address);
    this.log.info(`Channel starting on ${address}...`);
    this.stats = new ChannelStatsTracker({ heartbeatEmitter: this.app.heartbeatEmitter, log: this.log });
    this.configureHl7ServerAndConnections();
    this.maybeStartWorkers();
    await this.server.start(Number.parseInt(address.port, 10));
    this.log.info('Channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.log.info('Channel stopping...');
    // Stop the active pool AND any workers still draining from a prior shrink, so
    // a stopped channel leaves no worker writing to the queue behind our back.
    await Promise.allSettled([...this.workers, ...this.drainingWorkers].map((worker) => worker.stop()));
    this.workers = [];
    this.drainingWorkers = [];
    await Promise.allSettled(Array.from(this.connections.values()).map((connection) => connection.close()));
    await this.server.stop();
    this.stats.cleanup();
    this.started = false;
    this.log.info('Channel stopped successfully');
  }

  /**
   * Brings the worker pool up to {@link maxWorkers} running workers, but only if
   * we currently hold the queue lease. Grow-only — shrinking is handled by
   * {@link resizeWorkerPool} on config reload.
   *
   * Called from `start()` (when leadership may already be established by the time
   * the channel comes up) and from `onBecameQueueLeader()` (when leadership
   * arrives later, e.g. after waiting out a peer's lease during a zero-downtime
   * upgrade overlap).
   *
   * No-op when the queue is off, we're not leader, or the pool is already full —
   * so it's safe to call from either entry point.
   */
  private maybeStartWorkers(): void {
    // Reap workers that stepped down on lease loss (they self-terminate on a
    // QueueLeaseError rather than via a callback), so a later re-acquisition can
    // start fresh ones.
    this.workers = this.workers.filter((worker) => worker.isRunning());
    // Leader-gated, the cheap optimistic half: getDurableQueue() is undefined when
    // the queue is off, and isLeader() is false until we hold the lease.
    // `onBecameQueueLeader` calls back in once we acquire. The authoritative gate
    // is implicit in the queue's dispatch ops, which throw QueueLeaseError if the
    // lease moves out from under a running worker (the loop catches it and steps down).
    const queue = this.app.getDurableQueue();
    if (!queue?.isLeader()) {
      return;
    }
    while (this.workers.length < this.maxWorkers) {
      const worker = new ChannelQueueWorker({
        channelName: this.getDefinition().name,
        app: this.app,
        queue,
        log: this.log,
        retryPolicy: this.retryPolicy,
        sendAck: (response) => this.sendToRemote(response),
        // Compute the partition from the CURRENT spec at claim time. The arrow
        // reads `this.logicalChannelKeySpec` live, so a spec change reaches the
        // pool without recreating workers (they outlive reloads).
        computeKey: (originalMessage) => this.computeLogicalChannelKeyForStoredMessage(originalMessage),
        // Wake the whole pool when a worker releases a partition on settle, so an
        // idle sibling claims the promoted row without waiting on its poll.
        notifyPool: () => this.notifyWorkers(),
      });
      worker.start();
      // Wake the worker so any rows that landed in queue but were never dispatched
      // (e.g. left over from a prior process or inserted while the pool was off)
      // start moving without waiting for the idle poll.
      worker.notify();
      this.workers.push(worker);
    }
  }

  /**
   * Reconciles the running pool to the current {@link maxWorkers} and pushes the
   * current retry policy to every worker. Called from
   * {@link configureHl7ServerAndConnections} on config reload, since the workers
   * outlive reloads. Shrinking stops the excess workers with `{ drain: true }`
   * (fire-and-forget: each finishes its in-flight row rather than cancelling it —
   * a resize is not a shutdown); growing defers to {@link maybeStartWorkers}
   * (which is leader-gated).
   */
  private resizeWorkerPool(): void {
    this.workers = this.workers.filter((worker) => worker.isRunning());
    if (this.workers.length > this.maxWorkers) {
      const extras = this.workers.splice(this.maxWorkers);
      for (const worker of extras) {
        // Track the draining worker so its in-flight response / disconnect still
        // reaches it (see allWorkers); it removes itself once stop() resolves.
        this.drainingWorkers.push(worker);
        worker
          .stop({ drain: true })
          .catch((err) => this.log.error(`Error draining worker: ${normalizeErrorString(err)}`))
          .finally(() => {
            this.drainingWorkers = this.drainingWorkers.filter((w) => w !== worker);
          })
          .catch(() => {
            /* filter above cannot throw; keeps the fire-and-forget chain settled */
          });
      }
    }
    this.maybeStartWorkers();
    for (const worker of this.workers) {
      worker.setRetryPolicy(this.retryPolicy);
    }
  }

  /**
   * Notification from the App that we've taken the durable-queue lease.
   * Triggers worker bring-up for this channel if the pool isn't already full.
   */
  onBecameQueueLeader(): void {
    this.maybeStartWorkers();
  }

  /**
   * Computes the logical channel key for a parsed message under this channel's
   * current `logicalChannelKey` spec. `''` when no spec is set (single queue).
   *
   * NOT on the live dispatch path — a worker keys a claimed row from its stored
   * bytes via {@link computeLogicalChannelKeyForStoredMessage}. This variant takes
   * an already-parsed {@link Hl7Message} and is used for diagnostics and to assert
   * (in tests) that a spec reload took effect; both reflect the same current spec.
   * @param message - The parsed inbound HL7 message.
   * @returns The logical channel key (partition) for the message.
   */
  getLogicalChannelKey(message: Hl7Message): string {
    return computeLogicalChannelKey(message, this.logicalChannelKeySpec);
  }

  /** Wakes every pool worker so an idle one claims newly-enqueued work without waiting on its poll. */
  notifyWorkers(): void {
    for (const worker of this.workers) {
      worker.notify();
    }
  }

  /**
   * Routes a server `agent:transmit:response` to the pool worker that owns it.
   *
   * The response's callback identifies exactly one in-flight dispatch. We ask each
   * worker — the active pool AND any still draining after a shrink ({@link allWorkers})
   * — to resolve it if it's theirs; the first that does wins and we stop. A worker
   * spliced out by a shrink may still own this response, so it must be consulted or
   * its dispatch is lost. If none owns it, the response is *late* (its row already
   * timed out/settled) — we apply it once via any worker, since every worker shares
   * this channel's queue, retry policy, and ACK sender, so the late-settle is
   * identical whichever handles it. See {@link ChannelQueueWorker.tryResolveInFlight}
   * / {@link ChannelQueueWorker.applyLateResponse}.
   * @param response - The server response to route.
   */
  routeServerResponse(response: AgentTransmitResponse): void {
    const workers = this.allWorkers;
    for (const worker of workers) {
      if (worker.tryResolveInFlight(response)) {
        return;
      }
    }
    const handler = workers[0];
    if (handler) {
      handler.applyLateResponse(response);
    } else {
      // No worker to consume it (the pool is momentarily empty — e.g. all workers
      // stepped down on a lease loss). applyLateResponse — which normally logs the
      // drop — can't run, so log it here. Deliberately NOT forwarded to the legacy
      // in-memory path (that would re-send a stale ACK to the source).
      this.log.warn(
        `Discarding server response for channel '${this.getDefinition().name}': no worker available ` +
          `(callback=${response.callback ?? 'n/a'})`
      );
    }
  }

  /**
   * Resolves and applies the channel's `logicalChannelKey` spec (endpoint URL
   * param over agent-wide `channelLogicalChannelKey` over `''`), validating it
   * BEFORE it takes effect.
   *
   * - Invalid spec: {@link parseLogicalChannelKeySpec} already warned; we keep the
   *   previously-applied spec so a typo can't silently re-partition the channel.
   * - Valid: adopt the parsed spec. Fresh intake and the common re-dispatch paths
   *   (retry/requeue/restart) re-derive a row's partition at CLAIM time from this
   *   spec, so they need no rewrite. The exception is a spec CHANGE: rows not
   *   actively being claimed (backing-off `queued`, parked `delayed`) keep their
   *   last-stamped key, and the partition busy-check trusts stored keys — so on a
   *   real change we recompute the stored key of every `queued`/`delayed` row
   *   under the new spec (see {@link DurableQueue.recomputeLogicalChannelKeys}),
   *   which also un-parks `delayed` rows. Only the leader (the process that
   *   claims) needs this, so non-leaders skip it and re-key at claim time if they
   *   later take the lease. `claimed`/`inflight` rows finish under their current
   *   partition (a bounded transitional window).
   * @param params - The endpoint URL query params.
   */
  private applyLogicalChannelKeySpec(params: URLSearchParams): void {
    const raw = params.get('logicalChannelKey') ?? this.app.getChannelLogicalChannelKey() ?? '';
    const parsed = parseLogicalChannelKeySpec(raw, this.log);
    if (parsed === undefined) {
      // Invalid — keep the prior spec (and prior appliedLogicalChannelKeyRaw), so
      // a bad reload doesn't repartition.
      return;
    }
    this.logicalChannelKeySpec = parsed;
    if (raw === this.appliedLogicalChannelKeyRaw) {
      // Unchanged — no stored key can have gone stale relative to this spec.
      return;
    }
    this.appliedLogicalChannelKeyRaw = raw;
    const queue = this.app.getDurableQueue();
    if (!queue) {
      return;
    }
    // Only the dispatching leader claims, so only it needs stored keys refreshed
    // for the busy-check; a non-leader is a no-op here and re-keys at claim time if
    // it later takes the lease. Skipping non-leaders also keeps the recompute off a
    // demoted process (it never rewrites dispatch state it doesn't own).
    if (!queue.isLeader()) {
      return;
    }
    try {
      const changed = queue.recomputeLogicalChannelKeys(this.getDefinition().name, (originalMessage) =>
        this.computeLogicalChannelKeyForStoredMessage(originalMessage)
      );
      if (changed > 0) {
        this.notifyWorkers();
        this.log.info(
          `logicalChannelKey changed to '${raw || '(none)'}'; recomputed the partition of ${changed} queued/delayed message(s)`
        );
      }
    } catch (err) {
      // Recompute is best-effort: claim-time keying re-derives each row's partition
      // when it is next claimed, so a transient failure here can't corrupt state.
      // Still un-park any `delayed` rows so none is stranded waiting on a wake that
      // now targets a re-keyed partition (they re-evaluate at their next claim).
      this.log.warn(
        `logicalChannelKey changed to '${raw || '(none)'}', but recomputing queued/delayed partitions failed ` +
          `(will self-heal at claim time): ${normalizeErrorString(err)}`
      );
      try {
        if (queue.flipDelayedToQueued(this.getDefinition().name) > 0) {
          this.notifyWorkers();
        }
      } catch {
        // Best-effort only — recoverOnStartup re-queues any lingering delayed rows on restart.
      }
    }
  }

  /**
   * Computes a stored row's logical channel key from its persisted bytes under the
   * channel's CURRENT spec. Injected into each {@link ChannelQueueWorker} as its
   * claim-time `computeKey`, so the partition is always derived fresh from the live
   * spec. Synchronous and never throws: a row that no longer parses as HL7 falls
   * back to the default partition (`''`), so the worker's await-free critical
   * section can rely on it.
   * @param originalMessage - The row's `original_message` bytes (UTF-8 HL7 text).
   * @returns The computed logical channel key.
   */
  private computeLogicalChannelKeyForStoredMessage(originalMessage: Buffer): string {
    try {
      return computeLogicalChannelKey(Hl7Message.parse(originalMessage.toString('utf8')), this.logicalChannelKeySpec);
    } catch {
      return '';
    }
  }

  shouldAssignSeqNo(): boolean {
    return this.assignSeqNo;
  }

  /**
   * Returns the next MSH.13 sequence number from the in-memory counter (resets
   * on restart). Used only by the legacy (non-durable) path; the durable path
   * peeks/commits a persisted per-channel counter via the queue so a failed
   * intake doesn't consume a number. See {@link DurableQueue.peekNextSeqNo}.
   * @returns The next sequence number to assign.
   */
  takeNextSeqNo(): number {
    return ++this.lastSeqNo;
  }

  sendToRemote(msg: AgentTransmitResponse): boolean {
    const connection = this.connections.get(msg.remote);
    if (!connection) {
      this.log.warn(`Attempted to send message to disconnected remote: ${msg.remote}`);
      return false;
    }

    const hl7Message = Hl7Message.parse(msg.body);
    const msgControlId = hl7Message.getSegment('MSA')?.getField(2)?.toString();
    const ackCode = hl7Message.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase();

    if (
      ackCode &&
      isAppLevelAckCode(ackCode) &&
      !shouldSendAppLevelAck({
        mode: this.appLevelAckMode,
        ackCode,
        enhancedMode: this.enhancedMode,
      })
    ) {
      this.channelLog.debug(
        `[Skipping ACK -- Mode: ${this.appLevelAckMode} -- ID: ${msgControlId ?? 'not provided'} -- ACK: ${
          ackCode ?? 'unknown'
        }]`
      );
      // Suppressed by app-level ACK policy — this is a successful outcome from
      // the worker's perspective: no error occurred, we just chose not to forward.
      // Still clear the pending RTT entry: in aaMode the app-level ACK is the
      // response we were waiting on, so not recording it here would leave every
      // message pending until it timed out. (regression guard for #9443)
      if (msgControlId) {
        this.stats.recordAckReceived(msgControlId);
      }
      return true;
    }

    this.channelLog.info(`[Sending ACK -- ID: ${msgControlId}]: ${hl7Message.toString().replaceAll('\r', '\n')}`);
    try {
      connection.hl7Connection.send(Hl7Message.parse(msg.body));
    } catch (err) {
      this.channelLog.error(`Failed to send ACK to ${msg.remote}: ${normalizeErrorString(err)}`);
      return false;
    }

    if (msgControlId) {
      this.stats.recordAckReceived(msgControlId);
    }
    return true;
  }

  async reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void> {
    const previousEndpoint = this.endpoint;
    this.definition = definition;
    this.endpoint = endpoint;
    this.prefix = `[HL7:${definition.name}] `;

    this.log.info('Reloading config... Evaluating if channel needs to change address...');

    if (this.needToRebindToPort(previousEndpoint, endpoint)) {
      await this.stop();
      await this.start();
      this.log.info(`Address changed: ${previousEndpoint.address} => ${endpoint.address}`);
    } else if (previousEndpoint.address !== endpoint.address) {
      this.log.info(
        `Reconfiguring HL7 server and ${this.connections.size} connections based on new endpoint settings: ${previousEndpoint.address} => ${endpoint.address}`
      );
      this.configureHl7ServerAndConnections();
    } else {
      this.log.info(`No address change needed. Listening at ${endpoint.address}`);
      // The rest of configureHl7ServerAndConnections' inputs are endpoint URL
      // params, unchanged when the address string itself hasn't changed — but the
      // retry policy AND the logical-channels config (maxWorkers / logicalChannelKey)
      // ALSO depend on agent-wide settings, which an operator can change on their
      // own (a new Agent.setting with no endpoint edit at all). Refresh both
      // unconditionally so those reach the running pool instead of waiting for an
      // unrelated address change or a process restart.
      this.refreshRetryPolicy();
      this.refreshLogicalChannelConfig();
    }
  }

  private needToRebindToPort(firstEndpoint: Endpoint, secondEndpoint: Endpoint): boolean {
    if (
      firstEndpoint.address === secondEndpoint.address ||
      new URL(firstEndpoint.address).port === new URL(secondEndpoint.address).port
    ) {
      return false;
    }
    return true;
  }

  private configureHl7ServerAndConnections(): void {
    const address = new URL(this.getEndpoint().address);
    const encoding = address.searchParams.get('encoding') ?? undefined;
    const enhancedMode = parseEnhancedMode(address.searchParams.get('enhanced'), this.log);
    const assignSeqNo = address.searchParams.get('assignSeqNo')?.toLowerCase() === 'true';
    const messagesPerMinRaw = address.searchParams.get('messagesPerMin') ?? undefined;
    const appLevelAckRaw = address.searchParams.get('appLevelAck') ?? undefined;
    const duplicateBehaviorRaw = address.searchParams.get('duplicateBehavior') ?? undefined;
    let messagesPerMin = messagesPerMinRaw ? Number.parseInt(messagesPerMinRaw, 10) : undefined;

    if (messagesPerMin !== undefined && !Number.isInteger(messagesPerMin)) {
      this.log.warn(
        `Invalid messagesPerMin: '${messagesPerMinRaw}'; must be a valid integer. Creating channel without a set messagesPerMin...`
      );
      messagesPerMin = undefined;
    }

    this.appLevelAckMode = parseAppLevelAckMode(appLevelAckRaw, this.log);
    this.assignSeqNo = assignSeqNo;
    this.duplicateBehavior = parseDuplicateBehavior(duplicateBehaviorRaw, this.log);

    // If assignSeqNo is false or not set, set lastSeqNo to -1
    if (!assignSeqNo) {
      this.lastSeqNo = -1;
    }

    this.enhancedMode = enhancedMode;

    // In durable mode the agent owns the commit ACK: it must fire CA/AA only after
    // the message is durably on disk. We achieve that without any deferred-ACK hook
    // in @medplum/hl7 by simply NOT giving the connection an enhancedMode — the
    // connection's synchronous auto-ACK only runs when enhancedMode is set, so an
    // unset mode keeps it silent and the agent sends the ACK itself post-commit.
    // The legacy (non-durable) path keeps the passthrough, so the connection
    // auto-ACKs exactly as before.
    const queueOn = this.app.getDurableQueue() !== undefined;

    // Per-channel Path-2 (queue → Bot) auto-retry policy. Split into
    // refreshRetryPolicy so a settings-only reload (no address change) can push a
    // new policy at the running pool without going through the full reconfigure.
    this.refreshRetryPolicy();

    // Logical channels: pool size + partition spec. Split into
    // refreshLogicalChannelConfig so a settings-only reload (no address change)
    // can push new values at the running pool without a full reconfigure.
    this.refreshLogicalChannelConfig();

    const connectionEnhancedMode = queueOn ? undefined : enhancedMode;

    this.server.setEncoding(encoding);
    this.server.setEnhancedMode(connectionEnhancedMode);
    this.server.setMessagesPerMin(messagesPerMin);
    for (const connection of this.connections.values()) {
      connection.hl7Connection.setEncoding(encoding);
      connection.hl7Connection.setEnhancedMode(connectionEnhancedMode);
      connection.hl7Connection.setMessagesPerMin(messagesPerMin);
    }
  }

  /**
   * Resolves and pushes the channel's Path-2 (queue → Bot) auto-retry policy:
   * endpoint URL params override agent-wide `channelRetryMode` /
   * `channelAutoRetry*` settings, field by field (see `resolveRetryPolicy`). The
   * pool workers outlive config reloads, so the new policy is pushed at each
   * directly rather than the workers re-reading it.
   *
   * Split out from {@link configureHl7ServerAndConnections} — and called
   * unconditionally by both it and {@link reloadConfig}'s no-address-change
   * branch — because, unlike that method's other inputs (endpoint URL params,
   * which only change when the address string itself changes), this ALSO reads
   * agent-wide settings that can change on their own with no endpoint edit at
   * all. Gating it behind an address change would mean an operator's
   * settings-only update never reaches a running channel until an unrelated
   * address edit or a process restart.
   */
  private refreshRetryPolicy(): void {
    const address = new URL(this.getEndpoint().address);
    const queueOn = this.app.getDurableQueue() !== undefined;
    const retrySettings = this.app.getChannelRetrySettings();
    this.retryPolicy = resolveRetryPolicy(retrySettings, address.searchParams, this.log);
    // retryMode defaults to on (guaranteed), so the queue-off warning would
    // otherwise fire for every legacy channel — only warn when a retry mode was
    // explicitly asked for.
    const retryExplicitlyConfigured = address.searchParams.has('retryMode') || retrySettings.mode !== undefined;
    if (this.retryPolicy.enabled && !queueOn && retryExplicitlyConfigured) {
      this.log.warn('retryMode is configured but the durable queue is off; auto-retry has no effect without it');
    }
    for (const worker of this.workers) {
      worker.setRetryPolicy(this.retryPolicy);
    }
  }

  /**
   * Resolves and pushes the channel's logical-channels config — pool size
   * (`maxWorkers`) and partition spec (`logicalChannelKey`) — endpoint URL params
   * over agent-wide settings (`channelMaxWorkers` / `channelLogicalChannelKey`)
   * over the built-in defaults, then reconciles the worker pool.
   *
   * Split out from {@link configureHl7ServerAndConnections} — and called
   * unconditionally by both it and {@link reloadConfig}'s no-address-change branch
   * — for the same reason as {@link refreshRetryPolicy}: unlike that method's
   * other inputs (endpoint URL params, which only change when the address string
   * changes), these ALSO read agent-wide settings that an operator can change on
   * their own with no endpoint edit. Gating it behind an address change would mean
   * a settings-only update never reaches a running channel until an unrelated
   * address edit or a restart (the config-propagation gap this closes).
   */
  private refreshLogicalChannelConfig(): void {
    const params = new URL(this.getEndpoint().address).searchParams;
    const queueOn = this.app.getDurableQueue() !== undefined;

    const newMaxWorkers = resolveMaxWorkers(params, this.app.getChannelMaxWorkers(), this.log);
    const maxWorkersChanged = newMaxWorkers !== this.maxWorkers;
    this.maxWorkers = newMaxWorkers;

    // Whether the partition spec is actually changing — computed BEFORE apply so we
    // can gate the config-combination warnings on a real change (below). Mirrors
    // applyLogicalChannelKeySpec's own change check.
    const rawSpec = params.get('logicalChannelKey') ?? this.app.getChannelLogicalChannelKey() ?? '';
    const specChanged = rawSpec !== this.appliedLogicalChannelKeyRaw;

    this.applyLogicalChannelKeySpec(params);

    // Config-combination warnings: emit ONLY when maxWorkers or the spec actually
    // changed, so an unrelated settings-only reload (which now runs this method
    // every time) doesn't re-log the same no-effect warnings on every reload.
    if (maxWorkersChanged || specChanged) {
      if (this.maxWorkers > 1 && !queueOn) {
        this.log.warn('maxWorkers > 1 has no effect without the durable queue (concurrent processing requires it)');
      }
      // assignSeqNo stamps MSH.13 in per-channel arrival order at intake, but with a
      // worker pool, delivery across logical channels is concurrent — so a later
      // sequence number can reach the downstream before an earlier one. Warn rather
      // than forbid: the combination is valid if the downstream tolerates gaps.
      if (this.maxWorkers > 1 && this.assignSeqNo) {
        this.log.warn(
          'assignSeqNo with maxWorkers > 1: sequence numbers are assigned in arrival order, but delivery across ' +
            'logical channels is concurrent, so MSH.13 may reach the downstream out of order'
        );
      }
      // Symmetric to the maxWorkers warning: a partition spec does nothing without
      // the durable queue, since the legacy path never enqueues.
      if (this.logicalChannelKeySpec.length > 0 && !queueOn) {
        this.log.warn('logicalChannelKey has no effect without the durable queue (partitioning requires it)');
      }
    }

    // Reconcile the pool to maxWorkers (workers outlive reloads); resizeWorkerPool
    // also starts/stops workers to match and re-pushes the retry policy.
    this.resizeWorkerPool();
  }

  getDuplicateBehavior(): DuplicateBehavior {
    return this.duplicateBehavior;
  }

  /** @returns The channel's resolved Path-2 auto-retry policy. */
  getRetryPolicy(): RetryPolicy {
    return this.retryPolicy;
  }

  /**
   * @returns The channel's enhanced mode, as parsed from the endpoint URL. This is
   * the agent's source of truth in durable mode, where enhancedMode is deliberately
   * kept off the underlying {@link Hl7Connection} (see {@link enhancedMode}).
   */
  getEnhancedMode(): EnhancedMode {
    return this.enhancedMode;
  }

  private handleNewConnection(connection: Hl7Connection): void {
    // Newly-accepted sockets inherit the Hl7Server's enhancedMode at construction
    // (see Hl7Server). In durable mode that mode is left unset, so the connection
    // never auto-ACKs and the agent sends the commit ACK itself after the DB write.
    const c = new AgentHl7ChannelConnection(this, connection);
    updateStat('hl7ConnectionsOpen', getCurrentStats().hl7ConnectionsOpen + 1);
    c.hl7Connection.addEventListener('close', () => {
      this.log.info(`Closing connection: ${c.remote}`);
      this.connections.delete(c.remote);
      updateStat('hl7ConnectionsOpen', getCurrentStats().hl7ConnectionsOpen - 1);
    });
    this.log.info(`HL7 connection established: ${c.remote}`);
    this.connections.set(c.remote, c);
  }
}

export class AgentHl7ChannelConnection {
  readonly channel: AgentHl7Channel;
  readonly hl7Connection: Hl7Connection;
  readonly remote: string;

  constructor(channel: AgentHl7Channel, hl7Connection: Hl7Connection) {
    this.channel = channel;
    this.hl7Connection = hl7Connection;
    this.remote = `${hl7Connection.socket.remoteAddress}:${hl7Connection.socket.remotePort}`;

    // Add listener immediately to handle incoming messages
    this.hl7Connection.addEventListener('message', (event: Hl7MessageEvent) => this.handleMessage(event));
    this.hl7Connection.addEventListener('error', (event: Hl7ErrorEvent) => this.handleError(event));
    this.hl7Connection.addEventListener('enhancedAckSent', (event: Hl7EnhancedAckSentEvent) =>
      this.handleEnhancedAckSent(event)
    );
  }

  private async handleMessage(event: Hl7MessageEvent): Promise<void> {
    try {
      const msgControlId = event.message.getSegment('MSH')?.getField(10)?.toString();
      this.channel.channelLog.info(
        `[Received -- ID: ${msgControlId ?? 'not provided'}]: ${event.message.toString().replaceAll('\r', '\n')}`
      );

      // Snapshot the message exactly as received, before any transformation
      // (e.g. assignSeqNo rewriting MSH.13), so the durable path can persist it
      // for the intake duplicate-content comparison.
      //
      // `event.message.toString()` is already the *decoded* HL7 text (the
      // connection used iconv to decode the wire bytes per the channel encoding),
      // so we store/forward it as UTF-8 — exactly the body the legacy path sends.
      // Re-encoding through the channel's iconv name would throw for encodings
      // Node's Buffer doesn't natively know (e.g. iso-8859-1), dropping the message.
      const originalMessage = Buffer.from(event.message.toString(), 'utf8');

      // Record the message up front so a synchronous response below (a duplicate
      // replay or reject) can balance it via recordAckReceived instead of leaving
      // a pending RTT entry to be GC'd.
      if (msgControlId) {
        this.channel.stats.recordMessageSent(msgControlId);
      }

      // NOTE: sequence-number assignment (assignSeqNo) is intentionally NOT done
      // here. The durable path defers it until after the duplicate check so a
      // retransmit doesn't burn a sequence number; the legacy path assigns it
      // itself. See maybeAssignSeqNo.
      const queue = this.channel.app.getDurableQueue();
      if (queue) {
        await this.handleMessageDurable(queue, event, msgControlId, originalMessage);
      } else {
        this.handleMessageLegacy(event, msgControlId);
      }
    } catch (err) {
      this.channel.log.error(`HL7 error occurred - check channel logs`);
      this.channel.channelLog.error(`HL7 error: ${normalizeErrorString(err)}`);
    }
  }

  /**
   * Legacy non-durable inbound path: push directly to the in-memory WS queue.
   * Behavior unchanged from the pre-durable-queue agent — used when the
   * `durableQueue` setting is off.
   * @param event - The incoming HL7 message event from the underlying connection.
   * @param msgControlId - MSH.10 of the inbound message.
   */
  private handleMessageLegacy(event: Hl7MessageEvent, msgControlId: string | undefined): void {
    // No durable dedup on this path, so assign the sequence number immediately.
    this.maybeAssignSeqNo(event, msgControlId);
    this.channel.app.addToWebSocketQueue({
      type: 'agent:transmit:request',
      accessToken: 'placeholder',
      channel: this.channel.getDefinition().name,
      remote: this.remote,
      contentType: ContentType.HL7_V2,
      body: event.message.toString(),
      callback: `Agent/${this.channel.app.agentId}-${randomUUID()}`,
    });
  }

  /**
   * Assigns the next channel sequence number into MSH.13 when assignSeqNo is on.
   * The durable path calls this only after the duplicate check, so retransmits
   * don't consume a sequence number; the legacy path calls it on every message.
   * @param event - The inbound message event whose MSH.13 to set.
   * @param msgControlId - MSH.10, for logging only.
   */
  private maybeAssignSeqNo(event: Hl7MessageEvent, msgControlId: string | undefined): void {
    if (!this.channel.shouldAssignSeqNo()) {
      return;
    }
    const seqNo = this.channel.takeNextSeqNo();
    event.message.getSegment('MSH')?.setField(13, seqNo.toString());
    this.channel.channelLog.info(`Setting sequence number for message control ID '${msgControlId ?? 'n/a'}': ${seqNo}`);
  }

  /**
   * Parses MSH.13 as a non-negative integer sequence number.
   * @param event - The inbound message event.
   * @returns The parsed sequence number, or null when MSH.13 is absent/non-numeric.
   */
  private parseSeqNo(event: Hl7MessageEvent): number | null {
    const seqNoField = event.message.getSegment('MSH')?.getField(13)?.toString();
    return seqNoField && /^\d+$/.test(seqNoField) ? Number.parseInt(seqNoField, 10) : null;
  }

  /**
   * Durable inbound path (§8 of DURABLE_QUEUE_ARCHITECTURE.md):
   *
   *  1. INSERT a `queued` row.
   *  2. On success, send CA/AA via the deferred-ack API — only now is the
   *     sender allowed to drop their retransmit buffer.
   *  3. Notify the channel worker so it picks the row up immediately.
   *
   * Duplicate handling — a prior non-`nacked` row already owns this MSH.10
   * (in any state: queued/processing/processed/errored — see {@link handleDuplicate}):
   *  - `idempotent`: if the re-sent body matches the prior copy byte-for-byte,
   *    replay the prior server response ACK (or, if none yet, the commit ACK);
   *    if it differs, send AR — a different message reused a committed control ID.
   *  - `reject`: send CR (or AR in aaMode); insert a `nacked` audit row.
   *
   * Storage failure: send CR with the underlying error in MSA.3; best-effort
   * insert a `nacked` audit row (which may itself fail if the DB is unwritable —
   * intentional, not retried).
   * @param queue - The app-owned durable queue handle.
   * @param event - The incoming HL7 message event from the underlying connection.
   * @param msgControlId - MSH.10 of the inbound message (may be undefined for malformed messages).
   * @param originalMessage - The message exactly as received, before any transformation (for dedup comparison).
   */
  private async handleMessageDurable(
    queue: DurableQueue,
    event: Hl7MessageEvent,
    msgControlId: string | undefined,
    originalMessage: Buffer
  ): Promise<void> {
    const conn = this.hl7Connection;
    const enhancedMode = this.channel.getEnhancedMode();
    const enhancedModeColumn = enhancedMode ?? null;
    const channelName = this.channel.getDefinition().name;
    const msgType = event.message.getSegment('MSH')?.getField(9)?.toString() ?? null;
    const callbackId = `Agent/${this.channel.app.agentId}-${randomUUID()}`;
    const receivedAt = Date.now();

    // Sequence-number assignment is delegated to enqueue so it runs behind the
    // single duplicate check (a retransmit never burns a number) and only on a
    // durable insert. The callback stamps MSH.13 with the peeked candidate and
    // returns the finalized bytes; we mirror them into `finalizedMessage`/`seqNo`
    // so the storage-error audit row below reflects what was actually assigned. On
    // a duplicate the callback never fires, leaving the as-received bytes and the
    // inbound MSH.13 — exactly what the dedup comparison and audit row want.
    const assigning = this.channel.shouldAssignSeqNo();
    let finalizedMessage = originalMessage;
    let seqNo = this.parseSeqNo(event);
    let result: EnqueueResult;
    try {
      result = queue.enqueue(
        {
          channelName,
          remote: this.remote,
          msgControlId: msgControlId ?? null,
          msgType,
          originalMessage,
          finalizedMessage,
          encoding: conn.getEncoding() ?? null,
          enhancedMode: enhancedModeColumn,
          callbackId,
          seqNo,
          receivedAt,
          // No logicalChannelKey at intake: the partition is computed at claim time
          // from the current spec (see ChannelQueueWorker), so it can never go stale.
          // Snapshot the channel's guaranteed-delivery setting so recoverOnStartup
          // (which runs before channel policies resolve) requeues vs. fails this
          // row correctly if the agent restarts mid-dispatch.
          guaranteedDelivery: this.channel.getRetryPolicy().guaranteedDelivery,
        },
        assigning
          ? {
              assignSeqNo: (candidate: number): Buffer => {
                event.message.getSegment('MSH')?.setField(13, candidate.toString());
                this.channel.channelLog.info(
                  `Setting sequence number for message control ID '${msgControlId ?? 'n/a'}': ${candidate}`
                );
                finalizedMessage = Buffer.from(event.message.toString(), 'utf8');
                seqNo = candidate;
                return finalizedMessage;
              },
            }
          : undefined
      );
    } catch (err) {
      const reason = `storage error: ${normalizeErrorString(err)}`;
      this.channel.channelLog.error(`Durable enqueue failed for ${msgControlId ?? 'no-id'}: ${reason}`);
      // A storage error is transient (disk full, DB locked, ...), so answer with
      // the retryable *error* code — CE (standard) / AE (aaMode) — not a terminal
      // reject. The peer may retransmit, and because we write only a `nacked`
      // audit row (never a committed one) the resend is accepted as fresh.
      this.sendCommitNack(event.message, enhancedMode === 'aaMode' ? 'AE' : 'CE', 'storage error');
      this.recordImmediateAck(msgControlId);
      // Best-effort audit row. If this also fails, we've already told the sender
      // NACK so they will retry — the failure log above is sufficient. No
      // commitSeqNo happened, so the failed message consumed no sequence number.
      queue.enqueueRejected({
        channelName,
        remote: this.remote,
        msgControlId: msgControlId ?? null,
        msgType,
        originalMessage,
        finalizedMessage,
        encoding: conn.getEncoding() ?? null,
        enhancedMode: enhancedModeColumn,
        callbackId,
        seqNo,
        receivedAt,
        lastError: reason,
        errorCode: QueueErrorCode.StorageError,
      });
      return;
    }

    if (result.kind === 'duplicate') {
      // The single dedup authority lives in enqueue; on a hit the assignSeqNo
      // callback never ran, so no number was peeked/stamped/committed and the
      // audit fields still hold the as-received bytes + inbound MSH.13.
      this.handleDuplicate(queue, event, result.existing, msgControlId, {
        callbackId,
        msgType,
        originalMessage,
        finalizedMessage,
        enhancedModeColumn,
        seqNo,
        receivedAt,
      });
      return;
    }

    // Durably inserted (and the sequence counter advanced in the same
    // transaction) — now tell the sender CA/AA. The ack is a no-op outside
    // enhanced mode.
    this.sendCommitAck(event.message);
    // Balance the RTT entry recorded at intake (handleMessage). The commit ACK is
    // the source-facing response in durable mode, so it settles the round trip —
    // exactly as the storage-error and duplicate paths do. Without this, an aaMode
    // message would never balance: the worker suppresses the Bot's app-level AA
    // (applyServerResponse), so sendToRemote (the only other balancer) never runs,
    // and every message lingers in the pending map until the 5-min GC warns.
    this.recordImmediateAck(msgControlId);
    this.channel.notifyWorkers();
  }

  /**
   * Handles an inbound message whose `(channel, MSH.10)` already belongs to a
   * prior non-`nacked` row (`existing`), per the channel's `duplicateBehavior`:
   *
   * - `reject`: reject every collision (CR, or AR in aaMode) and write a
   *   `nacked` audit row — unchanged, now spanning all prior states.
   * - `idempotent` (default): treat a byte-for-byte re-send as a benign
   *   retransmit and replay the acknowledgment the sender missed —
   *   {@link AgentHl7Channel.sendToRemote the prior server response ACK} if the
   *   message was already dispatched, otherwise the commit ACK (CA/AA). A body
   *   that differs is a *different* message reusing a committed control ID, so
   *   we reject it with AR (and a `nacked` audit row) the same way `reject`
   *   handles any duplicate.
   *
   * The replayed ACKs go through {@link sendCommitAck}/{@link sendCommitNack} just
   * like a fresh message — a retransmit means the sender never saw the original
   * ACK and must be re-told, and the durable row is the dedup authority.
   * @param queue - The app-owned durable queue handle.
   * @param event - The duplicate inbound message event.
   * @param existing - The prior row that owns this MSH.10.
   * @param msgControlId - MSH.10 of the inbound message.
   * @param audit - Decoded fields of the inbound message, for any `nacked` audit row.
   * @param audit.callbackId - Callback ID minted for this inbound message.
   * @param audit.msgType - MSH.9 message type.
   * @param audit.originalMessage - Bytes as received (compared against the prior row's original_message).
   * @param audit.finalizedMessage - Bytes as transformed for dispatch (persisted on any audit row).
   * @param audit.enhancedModeColumn - Enhanced-mode column value to persist.
   * @param audit.seqNo - Sequence number (MSH.13), if any.
   * @param audit.receivedAt - Intake timestamp (ms).
   */
  private handleDuplicate(
    queue: DurableQueue,
    event: Hl7MessageEvent,
    existing: InboundRow,
    msgControlId: string | undefined,
    audit: {
      callbackId: string;
      msgType: string | null;
      originalMessage: Buffer;
      finalizedMessage: Buffer;
      enhancedModeColumn: 'standard' | 'aaMode' | null;
      seqNo: number | null;
      receivedAt: number;
    }
  ): void {
    const conn = this.hl7Connection;
    const enhancedMode = this.channel.getEnhancedMode();
    const idLabel = msgControlId ?? 'n/a';
    const behavior = this.channel.getDuplicateBehavior();

    // Compare the message as received (original_message), so a channel that
    // rewrites the message on intake (e.g. assignSeqNo bumping MSH.13) still
    // recognizes a genuine retransmit despite the differing finalized bytes.
    if (behavior === DuplicateBehavior.IDEMPOTENT && existing.originalMessage.equals(audit.originalMessage)) {
      // Exact retransmit: replay the ACK the sender missed, then balance stats.
      //
      // The SETTLED_MESSAGE_STATES check guards against replaying a STALE
      // response: a `queued`/`claimed`/`inflight` row's `serverResponseBody` can
      // still be superseded by a future attempt (auto-retry keeps it in flight
      // rather than terminal), so it isn't yet the row's final answer. In
      // practice `scheduleRetry` already clears the response columns when a row
      // returns to `queued` for another try, so this is defense-in-depth rather
      // than the only thing preventing a stale replay.
      if (
        existing.serverResponseBody &&
        existing.serverResponseBody.length > 0 &&
        SETTLED_MESSAGE_STATES.has(existing.state) &&
        this.replayServerAck(existing)
      ) {
        // If the original delivery failed (processed + undelivered), this
        // retransmit is what finally lands the ACK — close the source leg so the
        // row no longer reads as awaiting delivery.
        if (existing.ackOutcome === AckOutcome.UNDELIVERED) {
          queue.setAckOutcome(existing.id, AckOutcome.DELIVERED);
        }
        this.channel.channelLog.info(
          `[Duplicate idempotent -- ID: ${idLabel}] replayed prior server response ACK from row id=${existing.id}`
        );
        // replayServerAck → sendToRemote already recorded the ack in stats.
        return;
      }
      // No (replayable) server response yet — replay the commit ACK (CA/AA).
      this.channel.channelLog.info(
        `[Duplicate idempotent -- ID: ${idLabel}] replayed commit ACK for prior row id=${existing.id}`
      );
      this.sendCommitAck(event.message);
      this.recordImmediateAck(msgControlId);
      return;
    }

    // We're here in idempotent mode only when the content differs: a *different*
    // message reused a committed control ID. In `reject` mode we reject every
    // collision. Either way the code is terminal (CR, or AR in aaMode): the peer
    // must not retry, since a retransmit will fail identically.
    const contentMismatch = behavior === DuplicateBehavior.IDEMPOTENT;
    const reason = contentMismatch
      ? `duplicate control id ${idLabel}: a message with this control ID was already committed with different content`
      : 'duplicate control id';
    this.channel.channelLog.warn(`[Duplicate rejected -- ID: ${idLabel}] prior row id=${existing.id}: ${reason}`);
    this.sendCommitNack(event.message, enhancedMode === 'aaMode' ? 'AR' : 'CR', reason);
    this.recordImmediateAck(msgControlId);
    queue.enqueueRejected({
      channelName: this.channel.getDefinition().name,
      remote: this.remote,
      msgControlId: msgControlId ?? null,
      msgType: audit.msgType,
      originalMessage: audit.originalMessage,
      finalizedMessage: audit.finalizedMessage,
      encoding: conn.getEncoding() ?? null,
      enhancedMode: audit.enhancedModeColumn,
      callbackId: audit.callbackId,
      seqNo: audit.seqNo,
      receivedAt: audit.receivedAt,
      lastError: reason,
      errorCode: QueueErrorCode.DuplicateRejected,
    });
  }

  /**
   * Balances {@link ChannelStatsTracker} for a message we answered synchronously
   * at intake (duplicate replay / reject / storage-error NACK). `handleMessage`
   * already called `recordMessageSent`; without this the control ID would linger
   * in the pending map until the 5-minute GC, skewing pendingCount and RTT.
   * @param msgControlId - MSH.10 of the message just answered, if present.
   */
  private recordImmediateAck(msgControlId: string | undefined): void {
    if (msgControlId) {
      this.channel.stats.recordAckReceived(msgControlId);
    }
  }

  /**
   * Replays the stored server response ACK for an already-dispatched duplicate,
   * routing it through {@link AgentHl7Channel.sendToRemote} so the same
   * app-level ACK policy and encoding apply as on the original delivery.
   * @param existing - The prior row whose `serverResponseBody` to replay.
   * @returns True if the response ACK was delivered; false if it couldn't be parsed/sent.
   */
  private replayServerAck(existing: InboundRow): boolean {
    if (!existing.serverResponseBody) {
      return false;
    }
    try {
      return this.channel.sendToRemote({
        type: 'agent:transmit:response',
        channel: this.channel.getDefinition().name,
        remote: this.remote,
        contentType: ContentType.HL7_V2,
        body: existing.serverResponseBody.toString('utf8'),
        callback: existing.callbackId,
      });
    } catch (err) {
      this.channel.channelLog.warn(
        `[Duplicate idempotent] failed to replay server response ACK for row id=${existing.id}: ${normalizeErrorString(err)}`
      );
      return false;
    }
  }

  private async handleError(event: Hl7ErrorEvent): Promise<void> {
    this.channel.log.error(`HL7 connection error: ${normalizeErrorString(event.error)}`);
    this.channel.channelLog.error(`HL7 connection error: ${normalizeErrorString(event.error)}`);
  }

  /**
   * Sends the commit ACK (CA in `standard` enhanced mode, AA in `aaMode`) for an
   * inbound message that has been durably committed. No-op outside enhanced mode.
   *
   * This is the durable path's replacement for the connection's synchronous
   * auto-ACK: in durable mode the connection carries no enhancedMode (so it never
   * auto-ACKs), and the agent calls this only after the DB write succeeds — so the
   * CA/AA is a real promise that the message is on disk. Idempotency is not enforced
   * here; the on-disk row (channel + MSH.10) is the dedup authority, and a genuine
   * retransmit must be re-ACKed because the sender never saw the original.
   * @param message - The original inbound message to ACK.
   */
  private sendCommitAck(message: Hl7Message): void {
    const enhancedMode = this.channel.getEnhancedMode();
    if (!enhancedMode) {
      return;
    }
    const ackCode: AckCode = enhancedMode === 'standard' ? 'CA' : 'AA';
    const response = message.buildAck({ ackCode });
    this.hl7Connection.send(response);
    // Reuse the existing 'enhancedAckSent' listener for logging (handleEnhancedAckSent).
    this.hl7Connection.dispatchEvent(new Hl7EnhancedAckSentEvent(this.hl7Connection, response));
  }

  /**
   * Sends a negative commit ACK for an inbound message. The wire code is CE/CR in
   * `standard` enhanced mode and AE/AR in `aaMode` (error = retryable, reject =
   * terminal); the caller picks which best describes the failure. An optional
   * `reason` is written to MSA.3 for the sender's logs. No-op outside enhanced mode.
   * @param message - The original inbound message to NACK.
   * @param code - The negative ACK code to send.
   * @param reason - Optional human-readable explanation placed in MSA.3.
   */
  private sendCommitNack(message: Hl7Message, code: NackCommitCode, reason?: string): void {
    const enhancedMode = this.channel.getEnhancedMode();
    if (!enhancedMode) {
      return;
    }
    const response = message.buildAck({ ackCode: code });
    if (reason) {
      // Overwrite the default MSA.3 text (e.g. "Commit Reject") with the supplied reason.
      response.getSegment('MSA')?.setField(3, reason);
    }
    this.hl7Connection.send(response);
    this.hl7Connection.dispatchEvent(new Hl7EnhancedAckSentEvent(this.hl7Connection, response));
  }

  private handleEnhancedAckSent(event: Hl7EnhancedAckSentEvent): void {
    const hl7Message = event.message;
    const msgControlId = hl7Message.getSegment('MSA')?.getField(2)?.toString();
    const ackCode = hl7Message.getAckType();

    this.channel.channelLog.info(
      `[Sent ${describeAckCode(ackCode)} -- ID: ${msgControlId ?? 'not provided'}]: ${hl7Message.toString().replaceAll('\r', '\n')}`
    );
  }

  close(): Promise<void> {
    return this.hl7Connection.close();
  }
}

/**
 * Maps an MSA.1 acknowledgment code to a human-readable label for logging.
 * Covers the positive commit/app ACKs (CA/AA) and the NACK codes dispatched by
 * {@link AgentHl7Channel.sendCommitNack} (CE/CR/AE/AR) — without this, every
 * NACK would mislabel itself as "Immediate ACK (AA)".
 *
 * @param code - The MSA.1 acknowledgment code (already upper-cased), if present.
 * @returns A descriptive label, falling back to `ACK (<code>)` for anything unrecognized.
 */
export function describeAckCode(code: AckCode | undefined): string {
  switch (code) {
    case 'CA':
      return 'Commit ACK (CA)';
    case 'AA':
      return 'App ACK (AA)';
    case 'CE':
      return 'Commit Error (CE)';
    case 'CR':
      return 'Commit Reject (CR)';
    case 'AE':
      return 'App Error (AE)';
    case 'AR':
      return 'App Reject (AR)';
    case undefined:
    default:
      return `ACK (${code ?? 'unknown'})`;
  }
}

/**
 * Parses and normalizes the enhanced mode parameter from the endpoint URL.
 *
 * @param rawValue - The raw query parameter value retrieved from the endpoint URL (e.g., 'true', 'aa', or undefined).
 * @param logger - The Logger instance to use for logging.
 * @returns The parsed enhanced mode enum value.
 */
export function parseEnhancedMode(rawValue: string | null | undefined, logger: ILogger): EnhancedMode {
  if (!rawValue) {
    return undefined;
  }

  const normalizedValue = rawValue.toLowerCase();

  if (normalizedValue === 'true') {
    return 'standard';
  }

  if (normalizedValue === 'aa') {
    return 'aaMode';
  }

  logger.warn(
    `Invalid enhanced value '${rawValue}'; expected 'true' or 'aa'. Using standard mode (enhanced mode disabled).`
  );
  return undefined;
}

/**
 * Normalizes and validates the configured application-level ACK behavior.
 *
 * In the case that the passed-in `rawValue` is not a valid application-level ACK mode in alignment with valid values for `MSH-16`,
 * the function returns `AL` as a fallback, since that is the assumed default mode.
 *
 * @param rawValue - The raw query parameter value retrieved from the endpoint URL.
 * @param logger - The Logger instance to use for logging.
 * @returns The parsed application-level ACK mode, or `AL` if rawValue is invalid.
 */
export function parseAppLevelAckMode(rawValue: string | undefined, logger: ILogger): AppLevelAckMode {
  if (!rawValue) {
    return 'AL';
  }

  const normalizedValue = rawValue.toUpperCase();
  if (isAppLevelAckMode(normalizedValue)) {
    return normalizedValue;
  }

  logger.warn(`Invalid appLevelAck value '${rawValue}'; expected one of ${APP_LEVEL_ACK_MODES.join(', ')}. Using AL.`);
  return 'AL';
}

/**
 * Determines whether an ACK code is an application-level one or not.
 * @param code - The code to verify whether it is an application-level ACK code or not.
 * @returns True if the ACK code is an application-level one; otherwise, false.
 */
export function isAppLevelAckCode(code: string): code is AppLevelAckCode {
  return (APP_LEVEL_ACK_CODES as readonly string[]).includes(code);
}

/**
 * Determines whether a value is  is an application-level one or not.
 * @param candidate - The candidate to check.
 * @returns True if the value is a valid application-level ACK mode (valid MSH-16 value); otherwise, false.
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Fields/MSH-16
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Tables/0155
 */
export function isAppLevelAckMode(candidate: string): candidate is AppLevelAckMode {
  return (APP_LEVEL_ACK_MODES as readonly string[]).includes(candidate);
}

/**
 * Parses the `duplicateBehavior` URL query param controlling how the durable queue
 * handles same-(channel, MSH.10) collisions while a prior row is still in-flight.
 *
 * Invalid values fall back to `idempotent` (the safer default — replay the prior ACK
 * rather than reject and risk losing the message).
 * @param rawValue - Raw query-param value (typically from the endpoint URL).
 * @param logger - Logger used to emit a warning on invalid values.
 * @returns The resolved {@link DuplicateBehavior}.
 */
export function parseDuplicateBehavior(rawValue: string | undefined, logger: ILogger): DuplicateBehavior {
  if (!rawValue) {
    return DuplicateBehavior.IDEMPOTENT;
  }
  const normalized = rawValue.toLowerCase();
  if (normalized === DuplicateBehavior.REJECT || normalized === DuplicateBehavior.IDEMPOTENT) {
    return normalized;
  }
  logger.warn(`Invalid duplicateBehavior value '${rawValue}'; expected 'reject' or 'idempotent'. Using idempotent.`);
  return DuplicateBehavior.IDEMPOTENT;
}

/**
 * Resolves the effective Path-2 (queue → Bot) auto-retry policy for a channel.
 *
 * Per-field precedence: endpoint URL query param (`retryMode`,
 * `autoRetryBaseDelayMs`, `autoRetryMaxDelayMs`, `autoRetryMaxAttempts`,
 * `autoRetryBackoffMultiplier`) → agent-wide `channelRetryMode` / `channelAutoRetry*`
 * setting → {@link DEFAULT_RETRY_POLICY}. Invalid values warn and fall through to
 * the next layer, mirroring the other channel URL params.
 *
 * The retry mode ({@link RetryMode}) is the single behavior knob: `none` (no
 * retry), `normal` (retry transient failures, bounded), or `guaranteed` (retry
 * everything until upstream answers, unlimited). The built-in default is
 * `guaranteed` (see DEFAULT_RETRY_POLICY for why); `normal` drops maxAttempts to
 * {@link DEFAULT_NORMAL_MODE_MAX_ATTEMPTS} rather than the guaranteed default's 0.
 * Because mode is a single enum, the old "guaranteed but retry disabled" conflict
 * is unrepresentable — no forcing/warning is needed for it.
 *
 * This resolves only *how aggressively* to retry; *which* failures are eligible
 * is decided in the worker by classification (transient vs ambiguous — see
 * RetryPolicy / handleFailure in worker.ts). In particular, normal mode never
 * retries the ambiguous codes; only `guaranteed` opts into that (accepting
 * duplicate-delivery risk).
 *
 * Cross-field rule:
 * - `guaranteed` implies unlimited attempts (`maxAttempts = 0`). An explicitly
 *   configured nonzero `autoRetryMaxAttempts` conflicts: we warn and respect the
 *   explicit cap — delivery is then no longer guaranteed.
 * @param agentDefaults - Agent-wide settings (undefined fields = not configured).
 * @param params - The endpoint URL's query params.
 * @param logger - Logger used to emit warnings on invalid values.
 * @returns The resolved policy.
 */
export function resolveRetryPolicy(
  agentDefaults: AgentRetryDefaults,
  params: URLSearchParams,
  logger: ILogger
): RetryPolicy {
  const mode = parseRetryModeParam(params.get('retryMode'), logger) ?? agentDefaults.mode ?? DEFAULT_RETRY_MODE;
  const enabled = mode !== 'none';
  const guaranteedDelivery = mode === 'guaranteed';

  // "Explicit" = configured via param or agent setting, as opposed to the
  // built-in default — only an explicit cap conflicts with guaranteed mode.
  const explicitMaxAttempts =
    parseRetryNumberParam(params.get('autoRetryMaxAttempts'), 'autoRetryMaxAttempts', 0, logger) ??
    agentDefaults.maxAttempts;
  // guaranteed → unlimited (0); normal mode falls back to the normal-mode cap,
  // NOT DEFAULT_RETRY_POLICY.maxAttempts (which is 0 for the guaranteed default).
  let maxAttempts = explicitMaxAttempts ?? (guaranteedDelivery ? 0 : DEFAULT_NORMAL_MODE_MAX_ATTEMPTS);
  if (guaranteedDelivery && explicitMaxAttempts !== undefined && explicitMaxAttempts > 0) {
    logger.warn(
      `retryMode=guaranteed retries indefinitely, but autoRetryMaxAttempts=${explicitMaxAttempts} was explicitly configured; respecting autoRetryMaxAttempts — delivery is no longer guaranteed once attempts are exhausted.`
    );
    maxAttempts = explicitMaxAttempts;
  }

  const policy: RetryPolicy = {
    enabled,
    guaranteedDelivery,
    baseDelayMs:
      parseRetryNumberParam(params.get('autoRetryBaseDelayMs'), 'autoRetryBaseDelayMs', 1, logger) ??
      agentDefaults.baseDelayMs ??
      DEFAULT_RETRY_POLICY.baseDelayMs,
    maxDelayMs:
      parseRetryNumberParam(params.get('autoRetryMaxDelayMs'), 'autoRetryMaxDelayMs', 1, logger) ??
      agentDefaults.maxDelayMs ??
      DEFAULT_RETRY_POLICY.maxDelayMs,
    maxAttempts,
    backoffMultiplier:
      parseRetryNumberParam(params.get('autoRetryBackoffMultiplier'), 'autoRetryBackoffMultiplier', 1, logger) ??
      agentDefaults.backoffMultiplier ??
      DEFAULT_RETRY_POLICY.backoffMultiplier,
  };
  // The URL params are validated above, but agent-level settings arrive unchecked —
  // clamp so misconfigured settings degrade to sane values instead of, e.g., a
  // negative delay scheduling retries in the past.
  policy.baseDelayMs = Math.max(1, policy.baseDelayMs);
  policy.maxAttempts = Math.max(0, Math.floor(policy.maxAttempts));
  policy.backoffMultiplier = Math.max(1, policy.backoffMultiplier);
  if (policy.maxDelayMs < policy.baseDelayMs) {
    logger.warn(
      `autoRetryMaxDelayMs (${policy.maxDelayMs}) is less than autoRetryBaseDelayMs (${policy.baseDelayMs}); using autoRetryBaseDelayMs as the cap.`
    );
    policy.maxDelayMs = policy.baseDelayMs;
  }
  return policy;
}

/** Default worker-pool size for a channel: 1, i.e. the pre-logical-channel single serial worker. */
export const DEFAULT_MAX_WORKERS = 1;

/**
 * Hard ceiling on a channel's worker-pool size. A physical channel is one MLLP
 * listener draining a single SQLite queue, so a handful of concurrent dispatches
 * already saturates it, and every worker is a live polling loop plus a heartbeat
 * listener. This cap keeps a typo (`maxWorkers=1000000`) or a bad agent setting
 * from synchronously instantiating a runaway number of workers and stalling the
 * event loop / exhausting memory.
 */
export const MAX_MAX_WORKERS = 64;

/**
 * Resolves the channel's worker-pool size: how many messages (across distinct
 * logical channels) it may process concurrently. Precedence mirrors the retry
 * knobs — endpoint `maxWorkers` URL param over the agent-wide `channelMaxWorkers`
 * setting over {@link DEFAULT_MAX_WORKERS}. The value is clamped to an integer in
 * `[1, MAX_MAX_WORKERS]`; invalid URL params warn and fall through, and a value
 * above the ceiling is clamped with a warning (whatever the source) so a
 * misconfiguration degrades to a sane pool instead of a runaway one.
 *
 * Note this only bounds *concurrency*; per-logical-channel ordering is enforced
 * by the worker's post-claim partition check regardless of pool size, so raising
 * it never reorders a partition. With the default single logical channel it also
 * has no visible effect — the partition check keeps just one row in flight per key.
 * @param params - The endpoint URL query params.
 * @param agentDefault - The agent-wide `channelMaxWorkers` setting (undefined = not set).
 * @param logger - Logger used to warn on an invalid or out-of-range value.
 * @returns The resolved pool size (integer in `[1, MAX_MAX_WORKERS]`).
 */
export function resolveMaxWorkers(params: URLSearchParams, agentDefault: number | undefined, logger: ILogger): number {
  const fromParam = parseRetryNumberParam(params.get('maxWorkers'), 'maxWorkers', 1, logger);
  const resolved = Math.max(1, Math.floor(fromParam ?? agentDefault ?? DEFAULT_MAX_WORKERS));
  if (resolved > MAX_MAX_WORKERS) {
    logger.warn(`maxWorkers ${resolved} exceeds the maximum of ${MAX_MAX_WORKERS}; clamping to ${MAX_MAX_WORKERS}`);
    return MAX_MAX_WORKERS;
  }
  return resolved;
}

function parseRetryModeParam(rawValue: string | null, logger: ILogger): RetryMode | undefined {
  if (rawValue === null) {
    return undefined;
  }
  const normalized = rawValue.toLowerCase();
  if (isRetryMode(normalized)) {
    return normalized;
  }
  logger.warn(`Invalid retryMode value '${rawValue}'; expected 'none', 'normal', or 'guaranteed'. Ignoring.`);
  return undefined;
}

function parseRetryNumberParam(
  rawValue: string | null,
  name: string,
  min: number,
  logger: ILogger
): number | undefined {
  if (rawValue === null) {
    return undefined;
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < min) {
    logger.warn(`Invalid ${name} value '${rawValue}'; expected a number >= ${min}. Ignoring.`);
    return undefined;
  }
  return value;
}

/**
 * Determines whether an application-level ACK should be forwarded to the remote system.
 * @param options - The configuration describing the ACK mode, current ACK code, and enhanced mode setting.
 * @returns True if the ACK should be forwarded to the remote system; otherwise, false.
 */
export function shouldSendAppLevelAck(options: ShouldSendAppLevelAckOptions): boolean {
  const { mode, ackCode, enhancedMode } = options;
  // If enhanced mode is not enabled (undefined), always send the ACK
  if (!enhancedMode) {
    return true;
  }

  // For 'aaMode', never forward application-level ACKs (we already sent AA immediately)
  if (enhancedMode === 'aaMode') {
    return false;
  }

  // For 'standard' enhanced mode, follow the app-level ACK mode rules
  switch (mode) {
    case 'AL':
      return true;
    case 'NE':
      return false;
    case 'ER':
      return ackCode !== 'AA';
    case 'SU':
      return ackCode === 'AA';
    default:
      mode satisfies never;
      throw new Error('Invalid app-level ACK mode provided');
  }
}
