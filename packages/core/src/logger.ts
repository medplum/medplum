// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

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
export const LogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LogLevelNames = ['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const;

export interface LogMessage {
  level: (typeof LogLevelNames)[number];
  msg: string;
  timestamp: string;
  [key: string]: string | boolean | number;
}

export interface LoggerOptions {
  prefix?: string;
}

export interface ILoggerConfig {
  level: LogLevel;
  options?: LoggerOptions;
  metadata: Record<string, any>;
}

export interface LoggerConfig extends ILoggerConfig {
  write: (msg: string) => void;
}

export type LoggerConfigOverride = Partial<LoggerConfig>;

export interface ILogger {
  level: LogLevel;
  error(msg: string, data?: Record<string, any> | Error): void;
  warn(msg: string, data?: Record<string, any> | Error): void;
  info(msg: string, data?: Record<string, any> | Error): void;
  debug(msg: string, data?: Record<string, any> | Error): void;
  clone(overrides?: Partial<ILoggerConfig>): ILogger;
}

export class Logger implements ILogger {
  readonly write: (msg: string) => void;
  readonly metadata: Record<string, any>;
  readonly options?: LoggerOptions;
  readonly prefix?: string;
  level: LogLevel;

  constructor(
    write: (msg: string) => void,
    metadata: Record<string, any> = {},
    level: LogLevel = LogLevel.INFO,
    options: LoggerOptions = {}
  ) {
    this.write = write;
    this.metadata = metadata;
    this.level = level;
    this.options = options;

    if (options?.prefix) {
      this.prefix = options.prefix;
    }

    this.error = this.error.bind(this);
    this.warn = this.warn.bind(this);
    this.info = this.info.bind(this);
    this.debug = this.debug.bind(this);
    this.log = this.log.bind(this);
  }

  clone(override?: LoggerConfigOverride): Logger {
    const config = this.getLoggerConfig();
    const mergedConfig = override
      ? { ...config, override, options: { ...config.options, ...override.options } }
      : config;
    return new Logger(mergedConfig.write, mergedConfig.metadata, mergedConfig.level, mergedConfig.options);
  }

  private getLoggerConfig(): LoggerConfig {
    const { write, metadata, level, options } = this;
    return { write, metadata, level, options };
  }

  error(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.ERROR, msg, data);
  }

  warn(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.WARN, msg, data);
  }

  info(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.INFO, msg, data);
  }

  debug(msg: string, data?: Record<string, any> | Error): void {
    this.log(LogLevel.DEBUG, msg, data);
  }

  log(level: LogLevel, msg: string, data?: Record<string, any> | Error): void {
    if (level > this.level) {
      return;
    }

    let processedData: Record<string, any> | undefined;
    if (data instanceof Error) {
      processedData = serializeError(data);
    } else if (data) {
      processedData = { ...data };
      for (const [key, value] of Object.entries(processedData)) {
        if (value instanceof Error) {
          processedData[key] = serializeError(value);
        }
      }
    }

    this.write(
      JSON.stringify({
        level: LogLevelNames[level],
        timestamp: new Date().toISOString(),
        msg: this.prefix ? `${this.prefix}${msg}` : msg,
        ...processedData,
        ...this.metadata,
      })
    );
  }
}

export function parseLogLevel(level: string): LogLevel {
  const value = LogLevel[level.toUpperCase() as keyof typeof LogLevel];
  if (value === undefined) {
    throw new Error(`Invalid log level: ${level}`);
  }

  return value;
}

/**
 * Serializes an Error object into a plain object, including nested causes and custom properties.
 * @param error - The error to serialize.
 * @param depth - The current depth of recursion.
 * @param maxDepth - The maximum depth of recursion.
 * @returns A serialized representation of the error.
 */
export function serializeError(error: Error, depth = 0, maxDepth = 10): Record<string, any> {
  // Prevent infinite recursion
  if (depth >= maxDepth) {
    return { error: 'Max error depth reached' };
  }

  const serialized: Record<string, any> = {
    error: error.toString(),
    stack: error.stack?.split('\n'),
  };

  // Include error name if it's not the default "Error"
  if (error.name && error.name !== 'Error') {
    serialized.name = error.name;
  }

  // Include message explicitly for clarity
  if (error.message) {
    serialized.message = error.message;
  }

  // Handle Error.cause recursively
  if ('cause' in error && error.cause !== undefined) {
    if (error.cause instanceof Error) {
      serialized.cause = serializeError(error.cause, depth + 1, maxDepth);
    } else {
      // cause might not be an Error object
      serialized.cause = error.cause;
    }
  }

  // Include any custom properties on the error
  const customProps = Object.getOwnPropertyNames(error).filter(
    (prop) => !['name', 'message', 'stack', 'cause'].includes(prop)
  );

  for (const prop of customProps) {
    try {
      const value = (error as any)[prop];
      // Recursively handle nested errors in custom properties
      if (value instanceof Error) {
        serialized[prop] = serializeError(value, depth + 1, maxDepth);
      } else {
        serialized[prop] = value;
      }
    } catch {
      // Skip properties that can't be accessed
    }
  }

  return serialized;
}
