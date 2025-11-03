// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7Message, ILogger, TypedEventTarget } from '@medplum/core';
import { Hl7Client } from '@medplum/hl7';
import { ChannelStatsTracker } from './channel-stats-tracker';

export interface ClientStatsTrackingOptions {
  heartbeatEmitter: TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>;
  log?: ILogger;
}

export class EnhancedHl7Client extends Hl7Client {
  stats?: ChannelStatsTracker;

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
    this.stats = new ChannelStatsTracker(options);
  }

  stopTrackingStats(): void {
    this.stats?.cleanup();
    this.stats = undefined;
  }
}
