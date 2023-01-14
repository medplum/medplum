import { AuditEvent } from '@medplum/fhirtypes';
import { getConfig } from './config';

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
    if (getConfig().logAuditEvents) {
      console.log(JSON.stringify(auditEvent));
    }
  },
};
