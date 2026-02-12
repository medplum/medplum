// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7Message, ILogger } from '@medplum/core';
import type { Hl7ClientOptions, SendAndWaitOptions } from '@medplum/hl7';
import { Hl7Client } from '@medplum/hl7';
import { ChannelStatsTracker } from './channel-stats-tracker';
import type { HeartbeatEmitter } from './types';

export interface ClientStatsTrackingOptions {
  heartbeatEmitter: HeartbeatEmitter;
}

export interface ExtendedHl7ClientOptions extends Hl7ClientOptions {
  log?: ILogger;
}

export class EnhancedHl7Client extends Hl7Client {
  stats?: ChannelStatsTracker;
  log?: ILogger;

  constructor(options: ExtendedHl7ClientOptions) {
    super(options);
    this.log = options.log;
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
