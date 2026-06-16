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
import type { DurableQueue } from './queue/durable-queue';
import type { EnqueueResult, InboundRow } from './queue/types';
import { AckOutcome, DuplicateBehavior, QueueErrorCode } from './queue/types';
import type { RetryPolicy } from './queue/worker';
import {
  ChannelQueueWorker,
  DEFAULT_MAX_CONCURRENT_PER_QUEUE,
  DEFAULT_NORMAL_MODE_MAX_ATTEMPTS,
  DEFAULT_RETRY_POLICY,
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
  private maxConcurrentPerQueue: number = DEFAULT_MAX_CONCURRENT_PER_QUEUE;
  // The channel's own copy of the enhanced mode, parsed from the endpoint URL.
  // In durable mode this is intentionally NOT pushed onto the Hl7Connection (so
  // the connection's synchronous auto-ACK stays off and the agent can defer the
  // commit ACK until after the DB write); the connection therefore can't be the
  // source of truth, so we track it here and the durable path reads it directly.
  private enhancedMode: EnhancedMode = undefined;
  worker: ChannelQueueWorker | undefined;

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
    this.maybeStartWorker();
    await this.server.start(Number.parseInt(address.port, 10));
    this.log.info('Channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.log.info('Channel stopping...');
    if (this.worker) {
      await this.worker.stop();
      this.worker = undefined;
    }
    await Promise.allSettled(Array.from(this.connections.values()).map((connection) => connection.close()));
    await this.server.stop();
    this.stats.cleanup();
    this.started = false;
    this.log.info('Channel stopped successfully');
  }

  /**
   * Starts a {@link ChannelQueueWorker} bound to this channel and the app's
   * durable queue, but only if we currently hold the queue lease.
   *
   * Called both from `start()` (when leadership may already be established by
   * the time the channel comes up) and from `onBecameQueueLeader()` (when
   * leadership arrives later, e.g. after waiting out a peer's lease during a
   * zero-downtime upgrade overlap).
   *
   * No-op when the queue is off, we're not leader, or the worker is already
   * running — so it's safe to call from either entry point.
   */
  private maybeStartWorker(): void {
    if (this.worker) {
      return;
    }
    const queue = this.app.getDurableQueue();
    if (!queue) {
      return;
    }
    if (!this.app.isQueueLeader()) {
      // Not leader yet — `onBecameQueueLeader` will start the worker when we
      // acquire the lease.
      return;
    }
    this.worker = new ChannelQueueWorker({
      channelName: this.getDefinition().name,
      app: this.app,
      queue,
      log: this.log,
      retryPolicy: this.retryPolicy,
      maxConcurrentPerQueue: this.maxConcurrentPerQueue,
      sendAck: (response) => this.sendToRemote(response),
    });
    this.worker.start();
    // Wake the worker so any rows that landed in queue but were never dispatched
    // (e.g. left over from a prior process or inserted while the worker was off)
    // start moving without waiting for the idle poll.
    this.worker.notify();
  }

  /**
   * Notification from the App that we've taken the durable-queue lease.
   * Triggers worker bring-up for this channel if it isn't already running.
   */
  onBecameQueueLeader(): void {
    this.maybeStartWorker();
  }

  /**
   * Notification from the App that a peer stole the durable-queue lease. Stops
   * this channel's worker so the demoted process stops claiming and dispatching
   * rows from the now peer-owned queue, and clears it so a later
   * {@link onBecameQueueLeader} (on re-acquisition) brings a fresh worker back
   * up — `maybeStartWorker` no-ops while `this.worker` is set, so clearing it is
   * required.
   *
   * `worker.stop()` is awaited fire-and-forget: it drains in the background while
   * we return promptly to the lease loop. Any in-flight dispatch is rejected and
   * its row marked failed; SQLite serializes that write with the new leader's,
   * and the leader's `recoverOnStartup` reconciles interrupted rows, so this is
   * consistent.
   */
  onLostQueueLeadership(): void {
    const worker = this.worker;
    if (!worker) {
      return;
    }
    this.worker = undefined;
    worker.stop().catch((err) => {
      this.log.error(`Error stopping worker after lease loss: ${normalizeErrorString(err)}`);
    });
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

    // Per-channel Path-2 (queue → Bot) auto-retry policy: endpoint URL params
    // override agent-wide channelAutoRetry* settings, field by field. The worker
    // outlives config reloads, so push the new policy at it if it's already running.
    const retrySettings = this.app.getChannelRetrySettings();
    this.retryPolicy = resolveRetryPolicy(retrySettings, address.searchParams, this.log);
    // autoRetry defaults to on, so the queue-off warning would otherwise fire for
    // every legacy channel — only warn when retry behavior was explicitly asked for.
    const retryExplicitlyConfigured =
      address.searchParams.has('autoRetry') ||
      address.searchParams.has('guaranteedDelivery') ||
      retrySettings.enabled !== undefined ||
      retrySettings.guaranteedDelivery !== undefined;
    if (this.retryPolicy.enabled && !queueOn && retryExplicitlyConfigured) {
      this.log.warn(
        'autoRetry/guaranteedDelivery is configured but the durable queue is off; auto-retry has no effect without it'
      );
    }
    this.worker?.setRetryPolicy(this.retryPolicy);

    // Per-channel max in-flight limit: endpoint URL param overrides the
    // agent-wide channelMaxConcurrentPerQueue default, falling back to 1 (serial).
    this.maxConcurrentPerQueue = resolveMaxConcurrentPerQueue(
      this.app.getChannelMaxConcurrentPerQueue(),
      address.searchParams,
      this.log
    );
    this.worker?.setMaxConcurrentPerQueue(this.maxConcurrentPerQueue);

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

  getDuplicateBehavior(): DuplicateBehavior {
    return this.duplicateBehavior;
  }

  /** @returns The channel's resolved Path-2 auto-retry policy. */
  getRetryPolicy(): RetryPolicy {
    return this.retryPolicy;
  }

  /** @returns The channel's resolved max in-flight (queue → Bot) message count. */
  getMaxConcurrentPerQueue(): number {
    return this.maxConcurrentPerQueue;
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
    this.channel.worker?.notify();
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
      if (existing.serverResponseBody && existing.serverResponseBody.length > 0 && this.replayServerAck(existing)) {
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
    const ackCode = hl7Message.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase();

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
export function describeAckCode(code: string | undefined): string {
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
 * Per-field precedence: endpoint URL query param (`autoRetry`,
 * `guaranteedDelivery`, `autoRetryBaseDelayMs`, `autoRetryMaxDelayMs`,
 * `autoRetryMaxAttempts`, `autoRetryBackoffMultiplier`) → agent-wide
 * `channelAutoRetry*` / `channelGuaranteedDelivery` setting →
 * {@link DEFAULT_RETRY_POLICY}. Invalid values warn and fall through to the
 * next layer, mirroring the other channel URL params.
 *
 * The built-in default is **guaranteed delivery** (see DEFAULT_RETRY_POLICY for
 * why) with unlimited attempts. Opting out (`guaranteedDelivery=false`) drops to
 * normal mode, where maxAttempts falls back to
 * {@link DEFAULT_NORMAL_MODE_MAX_ATTEMPTS} rather than the guaranteed default's 0.
 *
 * This resolves only *how aggressively* to retry; *which* failures are eligible
 * is decided in the worker by classification (transient vs ambiguous — see
 * RetryPolicy / handleFailure in worker.ts). In particular, normal mode never
 * retries the ambiguous codes regardless of these knobs; only `guaranteedDelivery`
 * opts into that (accepting duplicate-delivery risk).
 *
 * Cross-field rules:
 * - `guaranteedDelivery` requires auto-retry: when autoRetry resolves to
 *   false, guaranteedDelivery is forced off — with a warning only if it was set
 *   explicitly (the default-on value is dropped silently).
 * - `guaranteedDelivery` implies unlimited attempts (`maxAttempts = 0`). An
 *   explicitly configured nonzero `autoRetryMaxAttempts` conflicts: we warn
 *   and respect the explicit cap — delivery is then no longer guaranteed.
 * @param agentDefaults - Agent-wide settings (undefined fields = not configured).
 * @param params - The endpoint URL's query params.
 * @param logger - Logger used to emit warnings on invalid values.
 * @returns The resolved policy.
 */
export function resolveRetryPolicy(
  agentDefaults: Partial<RetryPolicy>,
  params: URLSearchParams,
  logger: ILogger
): RetryPolicy {
  const enabled =
    parseRetryBoolParam(params.get('autoRetry'), 'autoRetry', logger) ??
    agentDefaults.enabled ??
    DEFAULT_RETRY_POLICY.enabled;

  // Track whether guaranteedDelivery was set explicitly (param or agent setting)
  // vs. inherited from the built-in default — guaranteedDelivery defaults to ON,
  // so the autoRetry=false conflict must only warn when the operator actually
  // asked for it, not for every channel that simply turns auto-retry off.
  const guaranteedExplicit =
    parseRetryBoolParam(params.get('guaranteedDelivery'), 'guaranteedDelivery', logger) ??
    agentDefaults.guaranteedDelivery;
  let guaranteedDelivery = guaranteedExplicit ?? DEFAULT_RETRY_POLICY.guaranteedDelivery;
  if (guaranteedDelivery && !enabled) {
    if (guaranteedExplicit === true) {
      logger.warn('guaranteedDelivery=true conflicts with autoRetry=false; ignoring guaranteedDelivery.');
    }
    guaranteedDelivery = false;
  }

  // "Explicit" = configured via param or agent setting, as opposed to the
  // built-in default — only an explicit cap conflicts with guaranteedDelivery.
  const explicitMaxAttempts =
    parseRetryNumberParam(params.get('autoRetryMaxAttempts'), 'autoRetryMaxAttempts', 0, logger) ??
    agentDefaults.maxAttempts;
  // guaranteedDelivery → unlimited (0); normal mode falls back to the normal-mode
  // cap, NOT DEFAULT_RETRY_POLICY.maxAttempts (which is 0 for the guaranteed default).
  let maxAttempts = explicitMaxAttempts ?? (guaranteedDelivery ? 0 : DEFAULT_NORMAL_MODE_MAX_ATTEMPTS);
  if (guaranteedDelivery && explicitMaxAttempts !== undefined && explicitMaxAttempts > 0) {
    logger.warn(
      `guaranteedDelivery retries indefinitely, but autoRetryMaxAttempts=${explicitMaxAttempts} was explicitly configured; respecting autoRetryMaxAttempts — delivery is no longer guaranteed once attempts are exhausted.`
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

/**
 * Resolves a channel's max in-flight (queue → Bot) message count. Precedence:
 * the `maxConcurrentPerQueue` endpoint URL param overrides the agent-wide
 * `channelMaxConcurrentPerQueue` default, which falls back to
 * {@link DEFAULT_MAX_CONCURRENT_PER_QUEUE} (1, fully serial).
 *
 * 1 preserves the strict per-channel ordering guarantee; values > 1 let the
 * worker keep that many messages in flight at once (ordering of completion is no
 * longer guaranteed) to raise throughput when the Bot leg is the bottleneck. The
 * result is clamped to an integer >= 1 — both the URL param (validated for >= 1)
 * and the agent setting (unchecked) degrade to a sane value instead of stalling
 * the worker with a 0 or negative limit.
 * @param agentDefault - Agent-wide `channelMaxConcurrentPerQueue` setting (undefined = not configured).
 * @param params - The endpoint URL's query params.
 * @param logger - Logger used to emit warnings on invalid values.
 * @returns The resolved limit (integer >= 1).
 */
export function resolveMaxConcurrentPerQueue(
  agentDefault: number | undefined,
  params: URLSearchParams,
  logger: ILogger
): number {
  const fromParam = parseRetryNumberParam(params.get('maxConcurrentPerQueue'), 'maxConcurrentPerQueue', 1, logger);
  const resolved = fromParam ?? agentDefault ?? DEFAULT_MAX_CONCURRENT_PER_QUEUE;
  return Math.max(1, Math.floor(resolved));
}

function parseRetryBoolParam(rawValue: string | null, name: string, logger: ILogger): boolean | undefined {
  if (rawValue === null) {
    return undefined;
  }
  const normalized = rawValue.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  logger.warn(`Invalid ${name} value '${rawValue}'; expected 'true' or 'false'. Ignoring.`);
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
