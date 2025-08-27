// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  deepClone,
  ILogger,
  ILoggerConfig,
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
import path from 'path';
import pino from 'pino';

export const DEFAULT_LOGGER_CONFIG = {
  logDir: __dirname,
  logRotateFreq: 'daily',
  maxFileSizeMb: 10,
  filesToKeep: 10,
  logLevel: LogLevel.INFO,
} as const satisfies AgentLoggerConfig;

export const DEFAULT_FULL_LOGGER_CONFIG = {
  main: DEFAULT_LOGGER_CONFIG,
  channel: DEFAULT_LOGGER_CONFIG,
} as const satisfies FullAgentLoggerConfig;

let loggerConfig: FullAgentLoggerConfig = deepClone(DEFAULT_FULL_LOGGER_CONFIG);

export const LOGGER_CONFIG_KEYS = [
  'logDir',
  'logRotateFreq',
  'maxFileSizeMb',
  'filesToKeep',
  'logLevel',
] as const satisfies (keyof typeof DEFAULT_LOGGER_CONFIG)[];
export type LoggerConfigKey = (typeof LOGGER_CONFIG_KEYS)[number];

export const VALID_ROTATE_FREQ = ['daily', 'hourly'] as const;

export type LogRotateFrequency = (typeof VALID_ROTATE_FREQ)[number];
export interface AgentLoggerConfig {
  logDir: string;
  logRotateFreq: LogRotateFrequency;
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

export interface PicoWrapperLoggerOptions extends LoggerOptions {
  level?: LogLevel;
  metadata?: Record<string, any>;
}

export interface PicoWrapperLoggerConfig extends ILoggerConfig {
  options?: PicoWrapperLoggerOptions;
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
  if (!(typeof config.logRotateFreq === 'string' && VALID_ROTATE_FREQ.includes(config.logRotateFreq))) {
    throw new OperationOutcomeError(
      validationError(`${configPathRoot}.logRotateFreq must be one of: ${VALID_ROTATE_FREQ.join(', ')}`)
    );
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
  };
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
