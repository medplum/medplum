// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { LogLevel } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentLoggerConfig, DEFAULT_LOGGER_CONFIG, LoggerType, WinstonWrapperLogger } from './logger';

/**
 * Creates a Winston logger for testing purposes similar to how it's done in agent-main.ts
 * @param logLevel - The log level to use (defaults to INFO)
 * @param loggerType - The type of logger (MAIN or CHANNEL, defaults to MAIN)
 * @returns A WinstonWrapperLogger instance
 */
export function createTestWinstonLogger(
  logLevel: LogLevel = LogLevel.INFO,
  loggerType: LoggerType = LoggerType.MAIN
): [WinstonWrapperLogger, () => void] {
  const uniqueId = randomUUID();
  const testDir = path.join(os.tmpdir(), `jest-test-${uniqueId}`);
  mkdirSync(testDir, { recursive: true });

  const config = {
    ...DEFAULT_LOGGER_CONFIG,
    logLevel,
    logDir: testDir,
  } as AgentLoggerConfig;

  const cleanup = (): void => {
    rmSync(testDir, { recursive: true });
  };

  return [new WinstonWrapperLogger(config, loggerType), cleanup];
}

/**
 * Generates a specified number of log entries with different levels and messages
 * @param logger - The Winston logger to write logs to
 * @param numLogs - The number of logs to generate
 * @param baseMessage - Optional base message to use (defaults to "Test log message")
 */
export function generateTestLogs(
  logger: WinstonWrapperLogger,
  numLogs: number,
  baseMessage: string = 'Test log message'
): void {
  const logLevels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
  const logMethods = [logger.debug, logger.info, logger.warn, logger.error];

  for (let i = 0; i < numLogs; i++) {
    const levelIndex = i % logLevels.length;
    const logMethod = logMethods[levelIndex];
    const message = `${baseMessage} ${i + 1}`;
    const metadata = {
      logIndex: i + 1,
      timestamp: new Date().toISOString(),
      testData: `test-value-${i + 1}`,
    };

    logMethod.call(logger, message, metadata);
  }
}
