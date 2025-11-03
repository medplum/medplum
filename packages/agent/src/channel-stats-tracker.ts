// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger, TypedEventTarget } from '@medplum/core';

/**
 * Interface for statistical data about message RTT (round-trip time).
 */
export type RttStats = {
  count: number;
  min: number;
  max: number;
  average: number;
  p50: number;
  p95: number;
  p99: number;
  pendingCount: number;
};

export interface ChannelStats {
  rtt: RttStats;
}

export interface ChannelStatsTrackerOptions {
  /** Maximum number of RTT samples to keep (default: 1000). */
  maxRttSamples?: number;
  /** Maximum age in milliseconds for pending messages before cleanup (default: 300000 = 5 minutes). */
  maxPendingAge?: number;
  /** Interval in milliseconds to cleanup pending messages (default: 60000 = 1 minute). */
  gcIntervalMs?: number;
  /** The TypedEventTarget to listen to for heartbeat events. Used for triggering GC cleanup on a set interval. */
  heartbeatEmitter: TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>;
  /** Optional logger for the tracker. */
  log?: ILogger;
}

/**
 * ChannelStats tracks message round-trip time (RTT) statistics.
 * It correlates outgoing messages with their acknowledgements to calculate RTT,
 * and provides percentile-based statistics (p99, p95, average, min, max).
 * Messages are only kept in memory as long as needed for correlation.
 */
export class ChannelStatsTracker {
  private readonly pendingMessages = new Map<string, number>();
  private readonly completedRtts: number[] = [];
  private readonly log?: ILogger;

  private readonly maxRttSamples: number;
  private readonly maxPendingAge: number;
  private readonly gcIntervalMs: number;
  private readonly heartbeatEmitter: TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>;
  private readonly heartbeatListener: () => void;

  private lastGcRun = Date.now();

  constructor({
    maxRttSamples = 1000,
    maxPendingAge = 1000 * 60 * 5,
    gcIntervalMs = 1000 * 60,
    heartbeatEmitter,
    log,
  }: ChannelStatsTrackerOptions) {
    this.maxRttSamples = maxRttSamples;
    this.maxPendingAge = maxPendingAge;
    this.gcIntervalMs = gcIntervalMs;
    this.heartbeatEmitter = heartbeatEmitter;
    this.log = log;

    const heartbeatListener = (): void => {
      // If it's been longer than gcIntervalMs milliseconds since last GC run, run again
      if (this.lastGcRun + this.gcIntervalMs <= Date.now()) {
        this.cleanupOldPendingMessages();

        // Then reset last GC run
        this.lastGcRun = Date.now();
      }
    };
    heartbeatEmitter.addEventListener('heartbeat', heartbeatListener);
    this.heartbeatListener = heartbeatListener;
  }

  /**
   * Records when a message is sent.
   * @param messageId - Unique identifier for the message.
   */
  recordMessageSent(messageId: string): void {
    this.pendingMessages.set(messageId, Date.now());
  }

  /**
   * Records when an acknowledgement is received and calculates RTT.
   * @param messageId - Unique identifier for the message.
   * @returns The calculated RTT in milliseconds, or undefined if no matching message was found.
   */
  recordAckReceived(messageId: string): number | undefined {
    const sentTime = this.pendingMessages.get(messageId);
    if (sentTime === undefined) {
      return undefined;
    }

    const rtt = Date.now() - sentTime;
    this.pendingMessages.delete(messageId);
    this.addRttSample(rtt);
    return rtt;
  }

  /**
   * Adds an RTT sample to the collection, maintaining max size.
   * @param rtt - RTT value in milliseconds.
   */
  private addRttSample(rtt: number): void {
    this.completedRtts.push(rtt);
    // Keep only the most recent samples
    if (this.completedRtts.length > this.maxRttSamples) {
      this.completedRtts.shift();
    }
  }

  /**
   * Removes pending messages that are older than maxPendingAge.
   */
  private cleanupOldPendingMessages(): void {
    const now = Date.now();
    const idsToDelete: string[] = [];

    for (const [messageId, timestamp] of this.pendingMessages.entries()) {
      if (now - timestamp > this.maxPendingAge) {
        idsToDelete.push(messageId);
      }
    }

    for (const id of idsToDelete) {
      this.log?.warn(`Cleaning up pending message; never got response for message with ID '${id}'`);
      this.pendingMessages.delete(id);
    }
  }

  /**
   * Calculates a specific percentile from RTT samples.
   * @param percentile - Percentile to calculate (0-100).
   * @returns The percentile value, or -1 if no samples exist.
   */
  private calculatePercentile(percentile: number): number {
    if (this.completedRtts.length === 0) {
      return -1;
    }

    const sorted = [...this.completedRtts].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Gets current statistics about message RTT.
   * @returns RttStats object containing all statistics.
   */
  getRttStats(): RttStats {
    const count = this.completedRtts.length;

    if (count === 0) {
      return {
        count: 0,
        min: -1,
        max: -1,
        average: -1,
        p50: -1,
        p95: -1,
        p99: -1,
        pendingCount: this.pendingMessages.size,
      };
    }

    const sum = this.completedRtts.reduce((acc, rtt) => acc + rtt, 0);
    const average = sum / count;
    const min = Math.min(...this.completedRtts);
    const max = Math.max(...this.completedRtts);

    return {
      count,
      min,
      max,
      average,
      p50: this.calculatePercentile(50),
      p95: this.calculatePercentile(95),
      p99: this.calculatePercentile(99),
      pendingCount: this.pendingMessages.size,
    };
  }

  /**
   * Gets all current channel statistics.
   * @returns All current channel statistics.
   */
  getStats(): ChannelStats {
    return { rtt: this.getRttStats() };
  }

  /**
   * Resets all statistics and pending messages.
   */
  reset(): void {
    this.pendingMessages.clear();
    this.completedRtts.length = 0;
  }

  /**
   * Gets the number of pending messages awaiting acknowledgement.
   * @returns The number of pending messages outstanding.
   */
  getPendingCount(): number {
    return this.pendingMessages.size;
  }

  /**
   * Gets the number of completed RTT samples.
   * @returns The current number of stored samples.
   */
  getSampleCount(): number {
    return this.completedRtts.length;
  }

  /**
   * Cleans up the ChannelStats instance.
   */
  cleanup(): void {
    this.heartbeatEmitter.removeEventListener('heartbeat', this.heartbeatListener);
  }
}
