import { Logger, LoggerConfigOverride, LoggerOptions, LogLevel } from '@medplum/core';
import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

let globalLogger = new Logger((msg) => console.log(msg));

export function getGlobalLogger(): Logger {
  return globalLogger;
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

export class FileLogger extends Logger {
  filePath: string;
  stream: Writable;

  constructor(filePath: string, metadata?: Record<string, any>, level?: LogLevel, options?: LoggerOptions) {
    super((msg) => this.writeImpl(msg), metadata, level, options);
    this.filePath = filePath;
    this.stream = createWriteStream(filePath, { encoding: 'utf-8', flags: 'a' });
  }

  private writeImpl(msg: string): void {
    this.stream.write(msg + '\n');
  }

  close(): void {
    this.stream.end();
  }

  clone(override?: LoggerConfigOverride): FileLogger {
    const config = this.getLoggerConfig();
    const mergedConfig = override
      ? { ...config, override, options: { ...config.options, ...override.options } }
      : config;
    return new FileLogger(this.filePath, mergedConfig.metadata, mergedConfig.level, mergedConfig.options);
  }
}
