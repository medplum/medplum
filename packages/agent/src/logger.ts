// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  deepClone,
  ILogger,
  isObject,
  LoggerOptions,
  LogLevel,
  LogLevelNames,
  OperationOutcomeError,
  parseLogLevel,
  splitN,
  validationError,
} from '@medplum/core';
import { Agent, AgentSetting } from '@medplum/fhirtypes';
import { normalize } from 'path';
import winston from 'winston';
import 'winston-daily-rotate-file';

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

export const DEFAULT_FULL_LOGGER_CONFIG = {
  main: DEFAULT_LOGGER_CONFIG,
  channel: DEFAULT_LOGGER_CONFIG,
} as const satisfies FullAgentLoggerConfig;

const LEVELS_TO_UPPERCASE = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
} as const;
export type ValidWinstonLogLevel = keyof typeof LEVELS_TO_UPPERCASE;

let loggerConfig: FullAgentLoggerConfig = deepClone(DEFAULT_FULL_LOGGER_CONFIG);

export function createLogger(loggerType: LoggerType, options?: WinstonWrapperLoggerOptions): WinstonWrapperLogger {
  return new WinstonWrapperLogger(getLoggerConfig()[loggerType], loggerType, options);
}

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

export interface FullAgentLoggerConfig {
  main: AgentLoggerConfig;
  channel: AgentLoggerConfig;
}

export interface PartialFullAgentLoggerConfig {
  main?: Partial<AgentLoggerConfig>;
  channel?: Partial<AgentLoggerConfig>;
}

export interface WinstonWrapperLoggerOptions extends LoggerOptions {
  metadata?: Record<string, any>;
}

export interface WinstonWrapperLoggerInitOptions extends WinstonWrapperLoggerOptions {
  parentLogger?: WinstonWrapperLogger;
}

export function setLoggerConfig(fullConfig: FullAgentLoggerConfig): void {
  validateFullAgentLoggerConfig(fullConfig);
  loggerConfig = fullConfig;
}

export function getLoggerConfig(): FullAgentLoggerConfig {
  if (!loggerConfig) {
    throw new Error('Tried to get logger config before initialized');
  }
  return loggerConfig;
}

export function validateLoggerConfig(config: AgentLoggerConfig, configPathRoot: string = 'config'): void {
  if (!(typeof config.logDir === 'string' && config.logDir.length > 0)) {
    throw new OperationOutcomeError(validationError(`${configPathRoot}.logDir must be a valid filepath string`));
  }
  if (
    !(typeof config.maxFileSizeMb === 'number' && config.maxFileSizeMb > 0 && Number.isInteger(config.maxFileSizeMb))
  ) {
    throw new OperationOutcomeError(validationError(`${configPathRoot}.maxFileSizeMb must be a valid integer`));
  }
  if (!(typeof config.filesToKeep === 'number' && config.filesToKeep > 0 && Number.isInteger(config.filesToKeep))) {
    throw new OperationOutcomeError(validationError(`${configPathRoot}.filesToKeep must be a valid integer`));
  }
  if (!(typeof config.logLevel === 'number' && LogLevelNames[config.logLevel] !== undefined)) {
    throw new OperationOutcomeError(
      validationError(`${configPathRoot}.logLevel must be a valid log level between LogLevel.NONE and LogLevel.DEBUG`)
    );
  }
}

export function validateFullAgentLoggerConfig(candidate: unknown): asserts candidate is FullAgentLoggerConfig {
  const fullConfig = candidate as FullAgentLoggerConfig;
  for (const configType of ['main', 'channel'] as const) {
    if (!isObject(fullConfig[configType])) {
      throw new OperationOutcomeError(validationError(`config.${configType} is not a valid object`));
    }
    validateLoggerConfig(fullConfig[configType], `config.${configType}`);
  }
}

export function mergeLoggerConfigWithDefaults(config: PartialFullAgentLoggerConfig): void {
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

export function parseLoggerConfigFromAgent(agentConfig: Agent): [FullAgentLoggerConfig, string[]] {
  const config: { main: Partial<AgentLoggerConfig>; channel: Partial<AgentLoggerConfig> } = {
    main: {},
    channel: {},
  } as const;
  const warnings = [] as string[];

  for (const setting of agentConfig.setting ?? []) {
    if (!setting.name.startsWith('logger.')) {
      continue;
    }
    // 'logger', [prefix], [name]
    const [_, configType, settingName] = splitN(setting.name, '.', 3) as [
      'logger',
      'main' | 'channel',
      LoggerConfigKey,
    ];

    if (!LOGGER_CONFIG_KEYS.includes(settingName)) {
      warnings.push(`logger.${configType}.${settingName} is not a valid setting name`);
    }

    const settingValue = extractValueFromSetting(setting);
    // If the setting is 'logLevel', we should convert to the LogLevel enum
    const configValue = settingName === 'logLevel' ? parseLogLevel(settingValue.toString()) : settingValue;

    if (configType === 'main') {
      config.main[settingName] = configValue as any;
    } else if (configType === 'channel') {
      config.channel[settingName] = configValue as any;
    } else {
      throw new OperationOutcomeError(
        validationError(`${configType} is not a valid config type, must be main or channel.`)
      );
    }
  }

  mergeLoggerConfigWithDefaults(config);
  validateFullAgentLoggerConfig(config);

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
          return { ...otherProps, level: LEVELS_TO_UPPERCASE[level as ValidWinstonLogLevel], msg: message } as any;
        },
      },
      winston.format.json()
    ),
    transports: [new winston.transports.Console()],
  });

  if (process.env.NODE_ENV !== 'test') {
    const dailyRotateTransport = new winston.transports.DailyRotateFile({
      filename: `${loggerType === LoggerType.MAIN ? 'medplum-agent-main' : 'medplum-agent-channels'}-%DATE%.log`,
      dirname: normalize(config.logDir),
      maxSize: `${config.maxFileSizeMb}m`,
      maxFiles: config.filesToKeep,
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

export class WinstonWrapperLogger implements ILogger {
  readonly loggerType: LoggerType;
  private parentLogger?: WinstonWrapperLogger;
  private config: AgentLoggerConfig;
  private metadata?: Record<string, any>;
  private prefix?: string;
  private winston: winston.Logger;
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

  reloadConfig(config: AgentLoggerConfig, options?: WinstonWrapperLoggerOptions): void {
    this.winston = this.parentLogger
      ? this.parentLogger.getWinston()
      : createWinstonFromLoggerConfig(config, this.loggerType);
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

  clone(override?: WinstonWrapperLoggerOptions): WinstonWrapperLogger {
    return new WinstonWrapperLogger(this.config, this.loggerType, {
      parentLogger: this.parentLogger,
      prefix: override?.prefix ?? this.prefix,
      metadata: override?.metadata ?? this.metadata,
    });
  }

  getWinston(): winston.Logger {
    return this.winston;
  }
}

function extractValueFromSetting<T extends string | boolean | number>(setting: AgentSetting): T {
  let value: string | boolean | number | undefined;
  for (const key of Object.keys(setting) as (keyof AgentSetting)[]) {
    if (!key.startsWith('value')) {
      continue;
    }
    if (value !== undefined) {
      throw new Error('Agent setting contains multiple value types');
    }
    value = setting[key] as T;
  }
  return value as T;
}
