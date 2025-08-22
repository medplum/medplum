// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ILogger, ILoggerConfig, LoggerOptions, LogLevel } from '@medplum/core';
import path from 'path';
import pino from 'pino';

export interface PicoWrapperLoggerOptions extends LoggerOptions {
  level?: LogLevel;
  metadata?: Record<string, any>;
}

export interface PicoWrapperLoggerConfig extends ILoggerConfig {
  options?: PicoWrapperLoggerOptions;
}

export function getPinoLevelFromMedplumLevel(level: LogLevel): pino.Level | 'silent' {
  switch (level) {
    case LogLevel.NONE:
      return 'silent';
    case LogLevel.ERROR:
      return 'error';
    case LogLevel.WARN:
      return 'warn';
    case LogLevel.INFO:
      return 'info';
    case LogLevel.DEBUG:
      return 'debug';
    default:
      throw new Error('Invalid log level');
  }
}

export const mainPinoLogger = pino({
  level: 'debug',
  transport: {
    targets: [
      { target: 'pino-pretty', level: 'info' },
      { target: 'pino/file', options: { destination: path.resolve(__dirname, 'logs.log') }, level: 'trace' },
    ],
  },
});

export class PinoWrapperLogger implements ILogger {
  readonly metadata?: Record<string, any>;
  private prefix?: string;
  private pinoLogger: pino.Logger;
  level: LogLevel;

  constructor(pino: pino.Logger, options?: PicoWrapperLoggerOptions) {
    this.pinoLogger = pino;
    this.prefix = options?.prefix;
    this.metadata = options?.metadata;
    this.level = options?.level ?? LogLevel.INFO;
    pino.level = getPinoLevelFromMedplumLevel(this.level);
  }

  debug(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.DEBUG, msg, data);
  }
  info(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.INFO, msg, data);
  }
  warn(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.WARN, msg, data);
  }
  error(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.ERROR, msg, data);
  }

  log(level: LogLevel, msg: string, data?: Record<string, any> | Error): void {
    if (level > this.level) {
      return;
    }
    if (data instanceof Error) {
      data = {
        error: data.toString(),
        stack: data.stack?.split('\n'),
      };
    }
    const dataToLog = { ...data, ...this.metadata };
    const msgToLog = this.prefix ? `${this.prefix}${msg}` : msg;
    switch (level) {
      case LogLevel.DEBUG:
        this.pinoLogger.debug(dataToLog, msgToLog);
        return;
      case LogLevel.INFO:
        this.pinoLogger.info(dataToLog, msgToLog);
        return;
      case LogLevel.WARN:
        this.pinoLogger.warn(dataToLog, msgToLog);
        return;
      case LogLevel.ERROR:
        this.pinoLogger.error(dataToLog, msgToLog);
    }
  }

  clone(override?: Partial<PicoWrapperLoggerConfig>): PinoWrapperLogger {
    return new PinoWrapperLogger(this.pinoLogger, {
      level: override?.options?.level ?? this.level,
      prefix: override?.options?.prefix ?? this.prefix,
      metadata: override?.metadata ?? this.metadata,
    });
  }
}
