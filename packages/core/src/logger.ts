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

export interface LoggerOptions {
  prefix?: string;
}

export interface LoggerConfig {
  write: (msg: string) => void;
  metadata: Record<string, any>;
  level: LogLevel;
  options?: LoggerOptions;
}

export type LoggerConfigOverride = Partial<LoggerConfig>;

export class Logger {
  readonly prefix?: string;
  constructor(
    readonly write: (msg: string) => void,
    readonly metadata: Record<string, any> = {},
    public level: LogLevel = LogLevel.INFO,
    readonly options?: LoggerOptions
  ) {
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
    if (level > this.level) {
      return;
    }
    if (data instanceof Error) {
      data = {
        error: data.toString(),
        stack: data.stack?.split('\n'),
      };
    }
    this.write(
      JSON.stringify({
        level: LogLevel[level],
        timestamp: new Date().toISOString(),
        msg: this.prefix ? `${this.prefix}${msg}` : msg,
        ...data,
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
