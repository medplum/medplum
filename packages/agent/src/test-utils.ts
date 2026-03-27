// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { LogLevel, TypedEventTarget } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExtendedHl7ClientOptions } from './enhanced-hl7-client';
import { EnhancedHl7Client } from './enhanced-hl7-client';
import type { Hl7ClientPoolOptions } from './hl7-client-pool';
import { Hl7ClientPool } from './hl7-client-pool';
import { Hl7MessageTracker } from './hl7-message-tracker';
import type { AgentLoggerConfig } from './logger';
import { DEFAULT_LOGGER_CONFIG, LoggerType, WinstonWrapperLogger } from './logger';
import type { HeartbeatEmitter } from './types';

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

export function createMockLogger(logLevel: LogLevel = LogLevel.INFO): ILogger & { log: jest.Mock; clone: jest.Mock } {
  const logger: Record<string, any> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
  logger.level = logLevel;
  logger.clone = jest.fn(() => logger);
  return logger as ILogger & { log: jest.Mock; clone: jest.Mock };
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

export function createTestEnhancedHl7Client(
  options: Omit<ExtendedHl7ClientOptions, 'messageTracker'> & { messageTracker?: Hl7MessageTracker }
): { client: EnhancedHl7Client; messageTracker: Hl7MessageTracker } {
  const messageTracker = options.messageTracker ?? new Hl7MessageTracker();
  const client = new EnhancedHl7Client({ ...options, messageTracker });
  return { client, messageTracker };
}

export function createTestHl7ClientPool(
  options: Omit<Hl7ClientPoolOptions, 'messageTracker' | 'heartbeatEmitter'> & {
    messageTracker?: Hl7MessageTracker;
    heartbeatEmitter?: HeartbeatEmitter;
  }
): { pool: Hl7ClientPool; messageTracker: Hl7MessageTracker; heartbeatEmitter: HeartbeatEmitter } {
  const messageTracker = options.messageTracker ?? new Hl7MessageTracker();
  const heartbeatEmitter = options.heartbeatEmitter ?? (new TypedEventTarget() as HeartbeatEmitter);
  const pool = new Hl7ClientPool({ ...options, messageTracker, heartbeatEmitter });
  return { pool, messageTracker, heartbeatEmitter };
}
