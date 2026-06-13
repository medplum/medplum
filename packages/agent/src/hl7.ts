// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, Hl7Message, normalizeErrorString } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import type {
  EnhancedMode,
  Hl7Connection,
  Hl7EnhancedAckSentEvent,
  Hl7ErrorEvent,
  Hl7MessageEvent,
} from '@medplum/hl7';
import { Hl7Server } from '@medplum/hl7';
import { randomUUID } from 'node:crypto';
import type { App } from './app';
import { BaseChannel } from './channel';
import { ChannelStatsTracker } from './channel-stats-tracker';
import type { DurableQueue } from './queue/durable-queue';
import type { EnqueueResult, InboundRow } from './queue/types';
import { DuplicateBehavior } from './queue/types';
import { ChannelQueueWorker } from './queue/worker';
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
        enhancedMode: this.server.getEnhancedMode(),
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

    this.server.setEncoding(encoding);
    this.server.setEnhancedMode(enhancedMode);
    this.server.setMessagesPerMin(messagesPerMin);
    const queueOn = this.app.getDurableQueue() !== undefined;
    for (const connection of this.connections.values()) {
      connection.hl7Connection.setEncoding(encoding);
      connection.hl7Connection.setEnhancedMode(enhancedMode);
      connection.hl7Connection.setMessagesPerMin(messagesPerMin);
      connection.hl7Connection.setDeferredCommitAck(queueOn);
    }
  }

  getDuplicateBehavior(): DuplicateBehavior {
    return this.duplicateBehavior;
  }

  private handleNewConnection(connection: Hl7Connection): void {
    // Apply the per-channel deferred-ack setting to every newly-accepted socket.
    // The Hl7Server has no built-in way to set this at construction, so we set it
    // here once before the application code starts seeing messages.
    if (this.app.getDurableQueue()) {
      connection.setDeferredCommitAck(true);
    }
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
      const originalMessage = Buffer.from(event.message.toString(), this.hl7Connection.getEncoding() as BufferEncoding);

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
   * Durable inbound path (§8 of DURABLE_QUEUE_PLAN.md):
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
    const enhancedMode = conn.getEnhancedMode();
    const enhancedModeColumn = enhancedMode ?? null;
    const channelName = this.channel.getDefinition().name;
    const msgType = event.message.getSegment('MSH')?.getField(9)?.toString() ?? null;
    const callbackId = `Agent/${this.channel.app.agentId}-${randomUUID()}`;
    const receivedAt = Date.now();

    // Duplicate detection runs BEFORE sequence-number assignment so a retransmit
    // never consumes a sequence number, and compares the original (as-received)
    // bytes so an assigned MSH.13 on the prior copy can't defeat the match.
    if (msgControlId) {
      const existing = queue.findSeenByControlId(channelName, msgControlId);
      if (existing) {
        this.handleDuplicate(queue, event, existing, msgControlId, {
          callbackId,
          msgType,
          originalMessage,
          // No sequence number is assigned to a duplicate, so the finalized
          // bytes equal the original.
          finalizedMessage: originalMessage,
          enhancedModeColumn,
          seqNo: this.parseSeqNo(event),
          receivedAt,
        });
        return;
      }
    }

    // Fresh message. Assign the sequence number (if configured) by PEEKING the
    // persisted counter — a non-consuming read — and stamping the candidate into
    // MSH.13. The counter is only advanced (commitSeqNo) after the row is durably
    // enqueued below, so a storage error consumes no sequence number. Everything
    // up to the insert is in the try so any failure routes to the NACK path.
    const assigning = this.channel.shouldAssignSeqNo();
    let finalizedMessage = originalMessage;
    let seqNo = this.parseSeqNo(event);
    let assignedSeqNo: number | undefined;
    let result: EnqueueResult;
    try {
      if (assigning) {
        const candidate = queue.peekNextSeqNo(channelName);
        event.message.getSegment('MSH')?.setField(13, candidate.toString());
        this.channel.channelLog.info(
          `Setting sequence number for message control ID '${msgControlId ?? 'n/a'}': ${candidate}`
        );
        finalizedMessage = Buffer.from(event.message.toString(), conn.getEncoding() as BufferEncoding);
        seqNo = candidate;
        assignedSeqNo = candidate;
      }
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
        },
        // Advance the persisted sequence counter atomically with the insert, so a
        // crash can't durably store the row while leaving the counter behind.
        assignedSeqNo !== undefined ? { commitSeqNo: assignedSeqNo } : undefined
      );
    } catch (err) {
      const reason = `storage error: ${normalizeErrorString(err)}`;
      this.channel.channelLog.error(`Durable enqueue failed for ${msgControlId ?? 'no-id'}: ${reason}`);
      conn.nackCommit(event.message, enhancedMode === 'aaMode' ? 'AR' : 'CR', 'storage error');
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
      });
      return;
    }

    if (result.kind === 'duplicate') {
      // Defensive only: the pre-check above already caught duplicates under the
      // single-process intake model; this guards a theoretical race. The counter
      // was peeked, not committed, so no sequence number is consumed.
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
    conn.ackCommit(event.message);
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
   * The replayed ACKs are sent directly (bypassing the connection's
   * already-acked guard) because a retransmit means the sender never saw the
   * original ACK and must be re-told.
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
    const enhancedMode = conn.getEnhancedMode();
    const idLabel = msgControlId ?? 'n/a';
    const behavior = this.channel.getDuplicateBehavior();

    // Compare the message as received (original_message), so a channel that
    // rewrites the message on intake (e.g. assignSeqNo bumping MSH.13) still
    // recognizes a genuine retransmit despite the differing finalized bytes.
    if (behavior === DuplicateBehavior.IDEMPOTENT && existing.originalMessage.equals(audit.originalMessage)) {
      // Exact retransmit: replay the ACK the sender missed, then balance stats.
      if (existing.serverResponseBody && existing.serverResponseBody.length > 0 && this.replayServerAck(existing)) {
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
      this.replayCommitAck(event.message);
      this.recordImmediateAck(msgControlId);
      return;
    }

    // We're here in idempotent mode only when the content differs: a *different*
    // message reused a committed control ID. Reject with AR. In `reject` mode we
    // reject every collision with CR (AR in aaMode), unchanged.
    const contentMismatch = behavior === DuplicateBehavior.IDEMPOTENT;
    const reason = contentMismatch
      ? `duplicate control id ${idLabel}: a message with this control ID was already committed with different content`
      : 'duplicate control id';
    this.channel.channelLog.warn(`[Duplicate rejected -- ID: ${idLabel}] prior row id=${existing.id}: ${reason}`);
    if (contentMismatch) {
      // Bypass the connection's already-acked guard: the prior (legit) copy was
      // acked under this control ID, so nackCommit would suppress this AR.
      this.replyAr(event.message, reason);
    } else {
      conn.nackCommit(event.message, enhancedMode === 'aaMode' ? 'AR' : 'CR', reason);
    }
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
   * Replays the commit ACK (CA in `standard` enhanced mode, AA in `aaMode`) for
   * a duplicate retransmit, bypassing the connection's already-acked guard. A
   * no-op when the channel isn't in enhanced mode (no commit ACK exists then).
   * @param message - The duplicate inbound message to ACK.
   */
  private replayCommitAck(message: Hl7Message): void {
    const enhancedMode = this.hl7Connection.getEnhancedMode();
    if (!enhancedMode) {
      return;
    }
    this.hl7Connection.send(message.buildAck({ ackCode: enhancedMode === 'standard' ? 'CA' : 'AA' }));
  }

  /**
   * Sends an application-reject (AR) for a content-mismatched duplicate, with
   * `reason` in MSA.3. Sent directly (bypassing the connection's already-acked
   * guard, which would otherwise suppress it because the prior copy under this
   * control ID was already acked). No-op when the channel isn't in enhanced
   * mode — the agent originates no ACKs on those channels.
   * @param message - The duplicate inbound message to reject.
   * @param reason - Human-readable explanation placed in MSA.3.
   */
  private replyAr(message: Hl7Message, reason: string): void {
    if (!this.hl7Connection.getEnhancedMode()) {
      return;
    }
    const ack = message.buildAck({ ackCode: 'AR' });
    ack.getSegment('MSA')?.setField(3, reason);
    this.hl7Connection.send(ack);
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
        body: existing.serverResponseBody.toString(this.hl7Connection.getEncoding() as BufferEncoding),
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

  private handleEnhancedAckSent(event: Hl7EnhancedAckSentEvent): void {
    const hl7Message = event.message;
    const msgControlId = hl7Message.getSegment('MSA')?.getField(2)?.toString();
    const ackCode = hl7Message.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase();

    this.channel.channelLog.info(
      `[Sent ${ackCode === 'CA' ? 'Commit ACK (CA)' : 'Immediate ACK (AA)'} -- ID: ${msgControlId ?? 'not provided'}]: ${hl7Message.toString().replaceAll('\r', '\n')}`
    );
  }

  close(): Promise<void> {
    return this.hl7Connection.close();
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
