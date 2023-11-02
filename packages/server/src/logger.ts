import { AuditEvent } from '@medplum/fhirtypes';
import { MedplumServerConfig, getConfig } from './config';
import { CloudWatchLogger } from './util/cloudwatch';
import { Writable } from 'node:stream';

/*
 * Once upon a time, we used Winston, and that was fine.
 * Then the log4j fiasco happened, and everyone started auditing logging libraries.
 * And we decided that we did not use any fancy logging features,
 * and that logging to console.log was actually perfectly adequate.
 */

/**
 * Logging level, with greater values representing more detailed logs emitted.
 *
 * The zero value means no server logs will be emitted.
 */
export enum LogLevel {
  NONE = 0,
  ERROR,
  WARN,
  INFO,
  DEBUG,
}

function levelString(level: LogLevel): string {
  switch (level) {
    case LogLevel.ERROR:
      return 'ERROR';
    case LogLevel.WARN:
      return 'WARN';
    case LogLevel.INFO:
      return 'INFO';
    case LogLevel.DEBUG:
      return 'DEBUG';
    default:
      return '';
  }
}

export class Logger {
  private out: Writable;
  private maxLevel: LogLevel;
  private metadata?: Record<string, any>;

  constructor(stream: Writable, metadata?: Record<string, any>, maxLevel?: LogLevel) {
    this.out = stream;
    this.maxLevel = maxLevel ?? (process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO);
    this.metadata = metadata;
  }

  error(msg: string, data?: Record<string, any>): void {
    this.log(LogLevel.ERROR, msg, data);
  }

  warn(msg: string, data?: Record<string, any>): void {
    this.log(LogLevel.WARN, msg, data);
  }

  info(msg: string, data?: Record<string, any>): void {
    this.log(LogLevel.INFO, msg, data);
  }

  debug(msg: string, data?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, msg, data);
  }

  log(level: LogLevel, msg: string, data?: Record<string, any>): void {
    if (level > this.maxLevel) {
      return;
    }
    if (data instanceof Error) {
      data = {
        error: data.toString(),
        stack: data.stack?.split('\n'),
      };
    }
    this.out.write(
      JSON.stringify({
        level: levelString(level),
        timestamp: new Date().toISOString(),
        msg,
        ...data,
        ...this.metadata,
      }) + '\n',
      'utf8'
    );
  }
}

export const globalLogger = {
  level: process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO,

  error(msg: string, data?: Record<string, any>): void {
    if (globalLogger.level >= LogLevel.ERROR) {
      globalLogger.log('ERROR', msg, data);
    }
  },

  warn(msg: string, data?: Record<string, any>): void {
    if (globalLogger.level >= LogLevel.WARN) {
      globalLogger.log('WARN', msg, data);
    }
  },

  info(msg: string, data?: Record<string, any>): void {
    if (globalLogger.level >= LogLevel.INFO) {
      globalLogger.log('INFO', msg, data);
    }
  },

  debug(msg: string, data?: Record<string, any>): void {
    if (globalLogger.level >= LogLevel.DEBUG) {
      globalLogger.log('DEBUG', msg, data);
    }
  },

  log(level: string, msg: string, data?: Record<string, any>): void {
    if (data instanceof Error) {
      data = { error: data.toString() };
    }
    console.log(
      JSON.stringify({
        level,
        timestamp: new Date().toISOString(),
        msg,
        ...data,
      })
    );
  },

  logAuditEvent(auditEvent: AuditEvent): void {
    const config = getConfig();
    if (config.logAuditEvents) {
      if (config.auditEventLogGroup) {
        getCloudWatchLogger(config).write(JSON.stringify(auditEvent));
      } else {
        console.log(JSON.stringify(auditEvent));
      }
    }
  },
};

let cloudWatchLogger: CloudWatchLogger | undefined = undefined;

function getCloudWatchLogger(config: MedplumServerConfig): CloudWatchLogger {
  if (!cloudWatchLogger) {
    cloudWatchLogger = cloudWatchLogger = new CloudWatchLogger(
      config.awsRegion,
      config.auditEventLogGroup as string,
      config.auditEventLogStream
    );
  }
  return cloudWatchLogger;
}

export function parseLogLevel(level: string): LogLevel {
  const value = LogLevel[level.toUpperCase() as keyof typeof LogLevel];
  if (value === undefined) {
    throw new Error(`Invalid log level: ${level}`);
  }

  return value;
}
