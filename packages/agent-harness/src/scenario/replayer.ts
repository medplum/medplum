// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Command, RecordedScenario, TimedCommand } from '../types';

/**
 * Schedules a list of TimedCommands relative to a fresh wall-clock start. The
 * caller provides the dispatch function (typically `scenario.issueCommand`).
 */
export class Replayer {
  private timers: NodeJS.Timeout[] = [];
  private readonly commands: TimedCommand[];
  private readonly dispatch: (c: Command) => void | Promise<void>;

  constructor(commands: TimedCommand[], dispatch: (c: Command) => void | Promise<void>) {
    this.commands = commands;
    this.dispatch = dispatch;
  }

  static fromRecording(rec: RecordedScenario, dispatch: (c: Command) => void | Promise<void>): Replayer {
    const commands: TimedCommand[] = rec.events
      .filter((e) => e.type === 'command.issued')
      .map((e) => ({ atMs: e.atMs, command: e.data as Command }));
    return new Replayer(commands, dispatch);
  }

  start(): void {
    this.stop();
    for (const tc of this.commands) {
      const handle = setTimeout(() => {
        Promise.resolve(this.dispatch(tc.command)).catch(() => undefined);
      }, Math.max(0, tc.atMs));
      this.timers.push(handle);
    }
  }

  stop(): void {
    for (const t of this.timers) {
      clearTimeout(t);
    }
    this.timers = [];
  }
}
