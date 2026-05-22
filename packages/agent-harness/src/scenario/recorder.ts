// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Command, RecordedScenario, ScenarioEvent, ScenarioSpec, TimedCommand } from '../types';

/**
 * In-memory recorder. Captures the initial spec, wall-clock start, and every
 * event emitted during the run. Producing a replayable timeline of commands
 * is `toReplay()`.
 */
export class Recorder {
  private startedAt = new Date().toISOString();
  private events: ScenarioEvent[] = [];
  readonly spec: ScenarioSpec;

  constructor(spec: ScenarioSpec) {
    this.spec = spec;
  }

  start(): void {
    this.startedAt = new Date().toISOString();
    this.events = [];
  }

  record(e: ScenarioEvent): void {
    this.events.push(e);
  }

  snapshot(): RecordedScenario {
    return { spec: this.spec, startedAt: this.startedAt, events: [...this.events] };
  }

  /**
   * Extract the timed command stream — what a replayer would re-issue. Filters
   * down to events that originate from `command.issued`.
   */
  toReplay(): TimedCommand[] {
    return this.events
      .filter((e) => e.type === 'command.issued')
      .map((e) => ({ atMs: e.atMs, command: e.data as Command }));
  }
}
