import { AuditEvent } from '@medplum/fhirtypes';
import { MedplumServerConfig, getConfig } from './config';
import { CloudWatchLogger } from './util/cloudwatch';

/*
 * Once upon a time, we used Winston, and that was fine.
 * Then the log4j fiasco happened, and everyone started auditing logging libraries.
 * And we decided that we did not use any fancy logging features,
 * and that logging to console.log was actually perfectly adequate.
 */

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export const logger = {
  level: process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO,

  error(...args: any[]): void {
    if (logger.level >= LogLevel.ERROR) {
      logger.log('ERROR', ...args);
    }
  },

  warn(...args: any[]): void {
    if (logger.level >= LogLevel.WARN) {
      logger.log('WARN', ...args);
    }
  },

  info(...args: any[]): void {
    if (logger.level >= LogLevel.INFO) {
      logger.log('INFO', ...args);
    }
  },

  debug(...args: any[]): void {
    if (logger.level >= LogLevel.DEBUG) {
      logger.log('DEBUG', ...args);
    }
  },

  log(level: string, ...args: any[]): void {
    console.log(level, new Date().toISOString(), ...args);
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
