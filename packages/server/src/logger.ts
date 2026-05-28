// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel, Logger } from '@medplum/core';
import { once } from 'node:events';
import { requestContextStore } from './request-context-store';

export function writeLineToStdout(msg: string): void {
  process.stdout.write(msg + '\n');
}

export async function drainStdout(): Promise<void> {
  if (!process.stdout.writableNeedDrain) {
    return;
  }
  await once(process.stdout, 'drain');
}

/**
 * Awaits stdout drain before calling `process.exit(code)`.
 *
 * `process.exit` immediately kills the process without flushing buffered writes,
 * so callers that have just written via `stdout.write` (e.g. final error logs)
 * must await drain themselves to avoid losing the last lines on exit.
 *
 * @param code - The exit code to pass to `process.exit`. Defaults to 1.
 */
export async function exitAfterStdoutDrain(code = 1): Promise<void> {
  await drainStdout();
  process.exit(code);
}

export const globalLogger = new Logger(
  writeLineToStdout,
  undefined,
  process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO
);

/**
 * @returns the current `IRequestContext.logger` if available, otherwise `globalLogger`
 */
export function getLogger(): Logger {
  return requestContextStore.getStore()?.logger ?? globalLogger;
}
