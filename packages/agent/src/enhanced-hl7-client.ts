// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7Message, ILogger, TypedEventTarget } from '@medplum/core';
import { Hl7Client } from '@medplum/hl7';
import { ChannelStatsTracker } from './channel-stats-tracker';

export interface ClientStatsTrackingOptions {
  heartbeatEmitter: TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>;
  log?: ILogger;
}

export interface PendingSerializedMessage {
  msg: Hl7Message;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class EnhancedHl7Client extends Hl7Client {
  stats?: ChannelStatsTracker;
  serializedMode = false;
  pendingMessages = new Map<number, PendingSerializedMessage>();
  lastSeqNo = -1;

  private processingQueue = false;

  send(msg: Hl7Message): Promise<void> {
    const msgControlId = msg.getSegment('MSH')?.getField(10)?.toString();
    if (this.stats && msgControlId) {
      this.stats.recordMessageSent(msgControlId);
    }
    return super.send(msg);
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    const msgControlId = msg.getSegment('MSH')?.getField(10)?.toString();
    if (this.serializedMode) {
      await this.handleSerializedMode(msg);
    }
    if (this.stats && msgControlId) {
      this.stats.recordMessageSent(msgControlId);
    }
    const responsePromise = super.sendAndWait(msg);
    if (this.serializedMode && !this.processingQueue) {
      this.processPendingMessages();
    }
    const response = await responsePromise;
    if (this.stats && msgControlId) {
      this.stats.recordAckReceived(msgControlId);
    }
    return response;
  }

  // TODO: What happens when an error happens / messages are lost to Lambda today? Should this result in timeout / get propagated back to sending device over channel?
  // This would probably get retried once we have the auto-retry logic / durable store

  // TODO: What happens when the channel connection gets reset? Is this reliant on durable storage so that connection reset doesn't reset the sequence number?
  // What if we reset to 0? Do we error out all pending messages? Should this be configurable? (strict, lax?)

  // TODO: What do we do when a message times out? Should we continue, or reject all subsequent messages / return to sender? (strict vs. lax)?
  async handleSerializedMode(msg: Hl7Message): Promise<void> {
    let seqNo: number = NaN;
    const seqNoRaw = msg.getSegment('MSH')?.getField(13)?.toString();
    if (seqNoRaw !== undefined) {
      // We're assuming that sequence is an integer
      seqNo = parseInt(seqNoRaw, 10);
    }
    if (Number.isNaN(seqNo)) {
      throw new Error(`Invalid sequence number while client in serialized mode: ${seqNoRaw}`);
    }
    if (this.pendingMessages.has(seqNo)) {
      throw new Error(`Duplicate sequence number for this client: ${seqNo}`);
    }
    if (seqNo < this.lastSeqNo) {
      throw new Error(`Sequence number ${seqNo} proceeds than last sequence number ${this.lastSeqNo}`);
    }
    // if (seqNo === 0) {
    // }
    // If the message sequence number is not the expected next sequence number, then add this to pending messages and see if we
    if (seqNo !== this.lastSeqNo + 1) {
      return new Promise<void>((resolve, reject) => {
        this.pendingMessages.set(seqNo, { msg, resolve, reject });
      });
    }
    // Sequence number is the next sequence, set the last sequence number
    this.lastSeqNo = seqNo;
    return Promise.resolve();
  }

  private processPendingMessages(): void {
    this.processingQueue = true;
    let nextSeqNo = this.lastSeqNo + 1;
    while (this.pendingMessages.has(nextSeqNo)) {
      this.pendingMessages.get(nextSeqNo)?.resolve();
      this.pendingMessages.delete(nextSeqNo);
      this.lastSeqNo = nextSeqNo;
      nextSeqNo++;
    }
    this.processingQueue = false;
  }

  startTrackingStats(options: ClientStatsTrackingOptions): void {
    if (this.stats) {
      return;
    }
    this.stats = new ChannelStatsTracker(options);
  }

  stopTrackingStats(): void {
    this.stats?.cleanup();
    this.stats = undefined;
  }

  setSerializedMode(enabled: boolean): void {
    this.serializedMode = enabled;
  }
}
