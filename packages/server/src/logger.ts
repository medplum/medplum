// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel, Logger } from '@medplum/core';
import { requestContextStore } from './request-context-store';

let drainPromise: Promise<void> | undefined;

export function writeLineToStdout(msg: string): void {
  if (drainPromise) {
    drainPromise = drainPromise.then(() => doWrite(msg));
    return;
  }
  doWrite(msg);
}

function doWrite(msg: string): void {
  if (!process.stdout.write(msg + '\n')) {
    drainPromise = new Promise<void>((resolve) => {
      process.stdout.once('drain', () => {
        drainPromise = undefined;
        resolve();
      });
    });
  }
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
