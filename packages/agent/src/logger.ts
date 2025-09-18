// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ILogger,
  ILoggerConfig,
  isObject,
  LoggerOptions,
  LogLevel,
  LogLevelNames,
  LogMessage,
  normalizeErrorString,
  parseLogLevel,
  splitN,
} from '@medplum/core';
import { normalize } from 'path';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT } from './constants';
import { AgentArgs } from './types';

export const LoggerType = {
  MAIN: 'main',
  CHANNEL: 'channel',
} as const;
export type LoggerType = (typeof LoggerType)[keyof typeof LoggerType];

export const DEFAULT_LOGGER_CONFIG = {
  logDir: __dirname,
  maxFileSizeMb: 10,
  filesToKeep: 10,
  logLevel: LogLevel.INFO,
} as const satisfies AgentLoggerConfig;

export const LOGGER_CONFIG_INTEGER_KEYS = ['maxFileSizeMb', 'filesToKeep'] as const;
export type LoggerConfigIntegerKey = (typeof LOGGER_CONFIG_INTEGER_KEYS)[number];

const LEVELS_TO_UPPERCASE = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
} as const;
export type ValidWinstonLogLevel = keyof typeof LEVELS_TO_UPPERCASE;

export const LOGGER_CONFIG_KEYS = [
  'logDir',
  'maxFileSizeMb',
  'filesToKeep',
  'logLevel',
] as const satisfies (keyof typeof DEFAULT_LOGGER_CONFIG)[];
export type LoggerConfigKey = (typeof LOGGER_CONFIG_KEYS)[number];

export interface AgentLoggerConfig {
  logDir: string;
  maxFileSizeMb: number;
  filesToKeep: number;
  logLevel: LogLevel;
}

export interface AgentMultiLoggerConfig {
  main: AgentLoggerConfig;
  channel: AgentLoggerConfig;
}

export interface PartialAgentMultiLoggerConfig {
  main?: Partial<AgentLoggerConfig>;
  channel?: Partial<AgentLoggerConfig>;
}

export interface WinstonWrapperLoggerOptions extends LoggerOptions {
  metadata?: Record<string, any>;
}

export interface WinstonWrapperLoggerInitOptions extends WinstonWrapperLoggerOptions {
  parentLogger?: WinstonWrapperLogger;
}

export interface FetchLogsOptions {
  limit?: number;
}

export function cleanupLoggerConfig(config: Partial<AgentLoggerConfig>, configPathRoot: string = 'config'): string[] {
  const warnings = [];

  if (typeof config.logDir !== 'undefined' && !(typeof config.logDir === 'string' && config.logDir.length > 0)) {
    warnings.push(`${configPathRoot}.logDir must be a valid filepath string`);
    // Cleanup invalid logger config prop
    config.logDir = undefined;
  }
  if (
    typeof config.maxFileSizeMb !== 'undefined' &&
    !(typeof config.maxFileSizeMb === 'number' && config.maxFileSizeMb > 0 && Number.isInteger(config.maxFileSizeMb))
  ) {
    warnings.push(`${configPathRoot}.maxFileSizeMb must be a valid integer`);
    // Cleanup invalid logger config prop
    config.maxFileSizeMb = undefined;
  }
  if (
    typeof config.filesToKeep !== 'undefined' &&
    !(typeof config.filesToKeep === 'number' && config.filesToKeep > 0 && Number.isInteger(config.filesToKeep))
  ) {
    warnings.push(`${configPathRoot}.filesToKeep must be a valid integer`);
    // Cleanup invalid logger config prop
    config.filesToKeep = undefined;
  }
  if (
    typeof config.logLevel !== 'undefined' &&
    !(typeof config.logLevel === 'number' && LogLevelNames[config.logLevel] !== undefined)
  ) {
    warnings.push(`${configPathRoot}.logLevel must be a valid log level between LogLevel.NONE and LogLevel.DEBUG`);
    // Cleanup invalid logger config prop
    config.logLevel = undefined;
  }

  return warnings;
}

export function cleanupMultiLoggerConfig(candidate: unknown): string[] {
  const warnings = [];
  const fullConfig = candidate as AgentMultiLoggerConfig;

  for (const configType of ['main', 'channel'] as const) {
    if (!isObject(fullConfig[configType])) {
      warnings.push(`config.${configType} is not a valid object`);
      // Cleanup invalid logger config
      fullConfig[configType] = {} as AgentLoggerConfig;
      continue;
    }

    warnings.push(...cleanupLoggerConfig(fullConfig[configType], `logger.${configType}`));
  }

  return warnings;
}

export function mergeLoggerConfigWithDefaults(
  config: PartialAgentMultiLoggerConfig
): asserts config is AgentMultiLoggerConfig {
  config.main ??= DEFAULT_LOGGER_CONFIG;
  config.channel ??= DEFAULT_LOGGER_CONFIG;
  for (const configType of ['main', 'channel'] as const) {
    for (const [key, value] of Object.entries(DEFAULT_LOGGER_CONFIG) as unknown as [
      keyof AgentLoggerConfig,
      number | string,
    ][]) {
      (config[configType] as Partial<AgentLoggerConfig>)[key] ??= value as any; // We expect that this value matches the type for the given key
    }
  }
}

export function parseLoggerConfigFromArgs(args: AgentArgs): [AgentMultiLoggerConfig, string[]] {
  const config: { main: Partial<AgentLoggerConfig>; channel: Partial<AgentLoggerConfig> } = {
    main: {},
    channel: {},
  } as const;
  const warnings = [] as string[];

  for (const [propName, propVal] of Object.entries(args)) {
    // Skip args not pertaining to the logger, or that do not have defined values
    if (!propName.startsWith('logger.') || propVal === undefined) {
      continue;
    }
    // 'logger', [prefix], [name]
    const [_, configType, settingName] = splitN(propName, '.', 3) as ['logger', 'main' | 'channel', LoggerConfigKey];

    if (!LOGGER_CONFIG_KEYS.includes(settingName)) {
      warnings.push(`${propName} is not a valid setting name`);
    }

    // If the setting is 'logLevel', we should convert to the LogLevel enum
    let configValue: string | number | undefined;
    if (settingName === 'logLevel') {
      try {
        configValue = parseLogLevel(propVal);
      } catch (err) {
        // Invalid log level
        warnings.push(`Error while parsing ${propName}: ${normalizeErrorString(err)}`);
      }
    } else if (LOGGER_CONFIG_INTEGER_KEYS.includes(settingName as LoggerConfigIntegerKey)) {
      try {
        configValue = Number.parseInt(propVal, 10);
      } catch (_err) {
        warnings.push(`Error while parsing ${propName}: ${propVal} is not a valid integer`);
      }
    } else {
      configValue = propVal;
    }

    if (configType === 'main') {
      config.main[settingName] = configValue as any;
    } else if (configType === 'channel') {
      config.channel[settingName] = configValue as any;
    } else {
      warnings.push(`${configType} is not a valid config type, must be main or channel`);
    }
  }

  warnings.push(...cleanupMultiLoggerConfig(config));
  mergeLoggerConfigWithDefaults(config);

  return [config, warnings];
}

export function getWinstonLevelFromMedplumLevel(level: LogLevel): string {
  switch (level) {
    // Return error for NONE since we are going to turn silent on anyways
    case LogLevel.NONE:
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

export function createWinstonFromLoggerConfig(config: AgentLoggerConfig, loggerType: LoggerType): winston.Logger {
  const level = getWinstonLevelFromMedplumLevel(config.logLevel);

  // When testing, just use the default config - it pipes raw JSON to stdout
  const logger = winston.createLogger({
    level,
    silent: config.logLevel === LogLevel.NONE,
    format: winston.format.combine(
      winston.format.timestamp(),
      // Custom transform to match previous Medplum logger output
      {
        transform: (info) => {
          const { message, level, ...otherProps } = info;
          return {
            ...otherProps,
            level: LEVELS_TO_UPPERCASE[level as ValidWinstonLogLevel],
            msg: message,
          } as unknown as winston.Logform.TransformableInfo;
        },
      },
      winston.format.json()
    ),
    transports: [new winston.transports.Console({ forceConsole: true })],
  });

  if (process.env.NODE_ENV !== 'test') {
    const dailyRotateTransport = new winston.transports.DailyRotateFile({
      filename: `${loggerType === LoggerType.MAIN ? 'medplum-agent-main' : 'medplum-agent-channels'}-%DATE%.log`,
      dirname: normalize(config.logDir),
      maxSize: `${config.maxFileSizeMb}m`,
      maxFiles: config.filesToKeep,
      json: true,
    });

    // Log any errors that happen
    // This is important for debugging broken logger configurations that are not outputting logs
    dailyRotateTransport.on('error', (err: unknown) => {
      console.error('Error in winston transport', err);
    });

    logger.add(dailyRotateTransport);
  }

  return logger;
}

export function isWinstonWrapperLogger(logger: ILogger): logger is WinstonWrapperLogger {
  return logger instanceof WinstonWrapperLogger;
}

export class WinstonWrapperLogger implements ILogger {
  readonly loggerType: LoggerType;
  private readonly parentLogger?: WinstonWrapperLogger;
  private readonly config: AgentLoggerConfig;
  private readonly metadata?: Record<string, any>;
  private readonly prefix?: string;
  private readonly winston: winston.Logger;
  level: LogLevel;

  constructor(config: AgentLoggerConfig, loggerType: LoggerType, options?: WinstonWrapperLoggerInitOptions) {
    this.loggerType = loggerType;
    this.parentLogger = options?.parentLogger;
    this.winston = this.parentLogger
      ? this.parentLogger.getWinston()
      : createWinstonFromLoggerConfig(config, loggerType);
    this.config = config;
    this.level = config.logLevel;
    this.metadata = options?.metadata;
    this.prefix = options?.prefix;
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
        this.winston.debug(msgToLog, dataToLog);
        return;
      case LogLevel.INFO:
        this.winston.info(msgToLog, dataToLog);
        return;
      case LogLevel.WARN:
        this.winston.warn(msgToLog, dataToLog);
        return;
      case LogLevel.ERROR:
        this.winston.error(msgToLog, dataToLog);
    }
  }

  clone(override?: Partial<ILoggerConfig>): WinstonWrapperLogger {
    return new WinstonWrapperLogger(this.config, this.loggerType, {
      parentLogger: this.parentLogger ?? this,
      prefix: override?.options?.prefix ?? this.prefix,
      metadata: override?.metadata ?? this.metadata,
    });
  }

  getWinston(): winston.Logger {
    return this.winston;
  }

  async fetchLogs(options?: FetchLogsOptions): Promise<LogMessage[]> {
    if (
      options?.limit !== undefined &&
      (typeof options.limit !== 'number' || options.limit <= 0 || options.limit > MAX_LOG_LIMIT)
    ) {
      throw new Error(
        `Invalid limit: ${options.limit} - must be a valid positive integer less than or equal to ${MAX_LOG_LIMIT}`
      );
    }
    const limit = options?.limit ?? DEFAULT_LOG_LIMIT;
    return new Promise((resolve, reject) => {
      this.winston.query(
        { order: 'desc', limit, fields: ['level', 'msg', 'timestamp'] },
        (err, results: { dailyRotateFile: LogMessage[] }) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(results.dailyRotateFile);
        }
      );
    });
  }
}
