// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7Message, ILogger, TypedEventTarget } from '@medplum/core';
import type { Hl7ClientOptions } from '@medplum/hl7';
import { Hl7Client } from '@medplum/hl7';
import { ChannelStatsTracker } from './channel-stats-tracker';

export const DEFAULT_CLOSE_COUNTDOWN_MS = 5_000; // 5 seconds

export interface ClientStatsTrackingOptions {
  heartbeatEmitter: TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>;
}

export interface ExtendedHl7ClientOptions extends Hl7ClientOptions {
  closeCountdownMs?: number;
  log?: ILogger;
}

export class EnhancedHl7Client extends Hl7Client {
  closeCountdownMs: number = DEFAULT_CLOSE_COUNTDOWN_MS;
  stats?: ChannelStatsTracker;
  closeTimeout?: NodeJS.Timeout;
  log?: ILogger;

  constructor(options: ExtendedHl7ClientOptions) {
    super(options);
    this.closeCountdownMs = options.closeCountdownMs ?? DEFAULT_CLOSE_COUNTDOWN_MS;
    this.log = options.log;
  }

  send(msg: Hl7Message): Promise<void> {
    const msgControlId = msg.getSegment('MSH')?.getField(10)?.toString();
    if (this.stats && msgControlId) {
      this.stats.recordMessageSent(msgControlId);
    }
    return super.send(msg);
  }

  async sendAndWait(msg: Hl7Message): Promise<Hl7Message> {
    const msgControlId = msg.getSegment('MSH')?.getField(10)?.toString();
    if (this.stats && msgControlId) {
      this.stats.recordMessageSent(msgControlId);
    }
    const response = await super.sendAndWait(msg);
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

  closeIfIdle(cb: () => void): void {
    if (this.closeTimeout) {
      return;
    }
    if (this.connection?.getPendingMessageCount() === 0) {
      // Start countdown to close
      this.closeTimeout = setTimeout(() => {
        this.close()
          .catch((err: Error) => {
            this.log?.error('Error while closing idle client', err);
          })
          // Call the callback on success or error
          .finally(cb);
      }, this.closeCountdownMs);
    }
  }
}
