// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel, Logger } from '@medplum/core';
import { requestContextStore } from './request-context-store';

export const globalLogger = new Logger(
  (msg) => console.log(msg),
  undefined,
  process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO
);

function write(msg: string): void {
  process.stdout.write(msg + '\n');
}

export const systemLogger = new Logger(write, undefined, LogLevel.ERROR);

/**
 * @returns the current `IRequestContext.logger` if available, otherwise `systemLogger`
 */
export function getLogger(): Logger {
  return requestContextStore.getStore()?.logger ?? systemLogger;
}
