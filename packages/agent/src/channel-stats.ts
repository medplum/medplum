// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for statistical data about message RTT (round-trip time).
 */
export interface RttStats {
  count: number;
  min: number | undefined;
  max: number | undefined;
  average: number | undefined;
  p50: number | undefined;
  p95: number | undefined;
  p99: number | undefined;
  pendingCount: number;
}

/**
 * ChannelStats tracks message round-trip time (RTT) statistics.
 * It correlates outgoing messages with their acknowledgements to calculate RTT,
 * and provides percentile-based statistics (p99, p95, average, min, max).
 * Messages are only kept in memory as long as needed for correlation.
 */
export class ChannelStats {
  private readonly pendingMessages = new Map<string, number>();
  private readonly completedRtts: number[] = [];
  private readonly maxRttSamples: number;
  private readonly maxPendingAge: number;
  private gcInterval: NodeJS.Timeout;

  /**
   * Creates a new ChannelStats instance.
   * @param maxRttSamples - Maximum number of RTT samples to keep (default: 1000).
   * @param maxPendingAge - Maximum age in milliseconds for pending messages before cleanup (default: 300000 = 5 minutes).
   * @param gcIntervalMs - Interval in milliseconds to cleanup pending messages (default: 60000 = 1 minute).
   */
  constructor(maxRttSamples = 1000, maxPendingAge = 300000, gcIntervalMs = 1000 * 60) {
    this.maxRttSamples = maxRttSamples;
    this.maxPendingAge = maxPendingAge;
    this.gcInterval = setInterval(() => {
      this.cleanupOldPendingMessages();
    }, gcIntervalMs);
  }

  /**
   * Records when a message is sent.
   * @param messageId - Unique identifier for the message.
   */
  recordMessageSent(messageId: string): void {
    this.pendingMessages.set(messageId, Date.now());
    this.cleanupOldPendingMessages();
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
      this.pendingMessages.delete(id);
    }
  }

  /**
   * Calculates a specific percentile from RTT samples.
   * @param percentile - Percentile to calculate (0-100).
   * @returns The percentile value, or undefined if no samples exist.
   */
  private calculatePercentile(percentile: number): number | undefined {
    if (this.completedRtts.length === 0) {
      return undefined;
    }

    const sorted = [...this.completedRtts].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Gets current statistics about message RTT.
   * @returns RttStats object containing all statistics.
   */
  getStats(): RttStats {
    const count = this.completedRtts.length;

    if (count === 0) {
      return {
        count: 0,
        min: undefined,
        max: undefined,
        average: undefined,
        p50: undefined,
        p95: undefined,
        p99: undefined,
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
   * Resets all statistics and pending messages.
   */
  reset(): void {
    this.pendingMessages.clear();
    this.completedRtts.length = 0;
  }

  /**
   * Gets the number of pending messages awaiting acknowledgement.
   */
  getPendingCount(): number {
    return this.pendingMessages.size;
  }

  /**
   * Gets the number of completed RTT samples.
   */
  getCompletedCount(): number {
    return this.completedRtts.length;
  }

  /**
   * Cleans up the ChannelStats instance.
   */
  cleanup(): void {
    clearInterval(this.gcInterval);
  }
}
