// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LRUCache } from '@medplum/core';

interface LogThrottleEntry {
  windowStart: number;
  suppressed: number;
}

/**
 * Limits how often a log line is written for each key.
 *
 * The first occurrence of a key is logged. Later occurrences within the window are counted instead of logged,
 * and the first occurrence after the window ends is logged with that count.
 *
 * State is per process and holds at most `maxKeys` keys; an evicted key is logged again on its next occurrence.
 */
export class LogThrottle {
  private readonly windowMs: number;
  private readonly entries: LRUCache<LogThrottleEntry>;

  constructor(windowMs: number, maxKeys = 1000) {
    this.windowMs = windowMs;
    this.entries = new LRUCache(maxKeys);
  }

  /**
   * Records an occurrence of `key`, and calls `log` unless the key was already logged within the window.
   * @param key - The key identifying the log line.
   * @param log - Writes the log line; receives the number of occurrences suppressed since the key was last logged.
   */
  maybeLog(key: string, log: (suppressed: number) => void): void {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (entry && now - entry.windowStart < this.windowMs) {
      entry.suppressed++;
      return;
    }
    this.entries.set(key, { windowStart: now, suppressed: 0 });
    log(entry?.suppressed ?? 0);
  }
}
