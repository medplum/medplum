// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel, Logger } from '@medplum/core';
import { requestContextStore } from './request-context-store';

export function writeLineToStdout(msg: string): void {
  process.stdout.write(msg + '\n');
}

export async function drainStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (err) => (err ? reject(err) : resolve()));
  });
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
