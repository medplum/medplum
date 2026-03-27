// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7Message, ILogger } from '@medplum/core';
import type {
  EnhancedMode,
  Hl7ClientOptions,
  Hl7Connection,
  Hl7ConnectionOptions,
  SendAndWaitOptions,
} from '@medplum/hl7';
import { Hl7Client } from '@medplum/hl7';
import type { Socket } from 'node:net';
import { ChannelStatsTracker } from './channel-stats-tracker';
import type { Hl7MessageTracker } from './hl7-message-tracker';
import { TrackedHl7Connection } from './hl7-message-tracker';
import type { HeartbeatEmitter } from './types';

export interface ClientStatsTrackingOptions {
  heartbeatEmitter: HeartbeatEmitter;
}

export interface ExtendedHl7ClientOptions extends Hl7ClientOptions {
  messageTracker: Hl7MessageTracker;
  log?: ILogger;
}

export class EnhancedHl7Client extends Hl7Client {
  readonly messageTracker: Hl7MessageTracker;
  stats?: ChannelStatsTracker;
  log?: ILogger;

  constructor(options: ExtendedHl7ClientOptions) {
    super(options);
    this.messageTracker = options.messageTracker;
    this.log = options.log;
  }

  protected override createConnection(
    socket: Socket,
    encoding?: string,
    enhancedMode?: EnhancedMode,
    options?: Hl7ConnectionOptions
  ): Hl7Connection {
    return new TrackedHl7Connection(socket, encoding, this.messageTracker, enhancedMode, options);
  }

  send(msg: Hl7Message): Promise<void> {
    const msgControlId = msg.getSegment('MSH')?.getField(10)?.toString();
    if (this.stats && msgControlId) {
      this.stats.recordMessageSent(msgControlId);
    }
    return super.send(msg);
  }

  async sendAndWait(msg: Hl7Message, options?: SendAndWaitOptions): Promise<Hl7Message> {
    const msgControlId = msg.getSegment('MSH')?.getField(10)?.toString();
    if (this.stats && msgControlId) {
      this.stats.recordMessageSent(msgControlId);
    }
    const response = await super.sendAndWait(msg, options);
    if (this.stats && msgControlId) {
      this.stats.recordAckReceived(msgControlId);
    }
    return response;
  }

  startTrackingStats(options: ClientStatsTrackingOptions): void {
    if (this.stats) {
      return;
    }
    this.stats = new ChannelStatsTracker({ log: this.log, ...options });
  }

  stopTrackingStats(): void {
    this.stats?.cleanup();
    this.stats = undefined;
  }
}
