// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { LogLevel, LogLevelNames, parseLogLevel, sleep } from '@medplum/core';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createWinstonFromLoggerConfig,
  DEFAULT_LOGGER_CONFIG,
  getWinstonLevelFromMedplumLevel,
  LoggerType,
  parseLoggerConfigFromArgs,
  WinstonWrapperLogger,
} from './logger';
import type { AgentArgs } from './types';

describe('Agent Logger', () => {
  describe('parseLoggerConfigFromArgs', () => {
    test('should emit no warnings when given a fully valid partial config', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logDir': '/tmp/logs',
        'logger.main.logLevel': 'DEBUG',
        'logger.channel.logDir': '/tmp/channel-logs',
        'logger.channel.logLevel': 'WARN',
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toHaveLength(0);
      expect(config.main.logDir).toBe('/tmp/logs');
      expect(config.main.logLevel).toBe(LogLevel.DEBUG);
      expect(config.channel.logDir).toBe('/tmp/channel-logs');
      expect(config.channel.logLevel).toBe(LogLevel.WARN);
      expect(config.main.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      expect(config.main.filesToKeep).toBe(DEFAULT_LOGGER_CONFIG.filesToKeep);
      expect(config.channel.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      expect(config.channel.filesToKeep).toBe(DEFAULT_LOGGER_CONFIG.filesToKeep);
    });

    test('should emit no warnings when given a fully valid full config', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logDir': '/var/log/medplum',
        'logger.main.logLevel': 'ERROR',
        'logger.main.maxFileSizeMb': '100',
        'logger.main.filesToKeep': '15',
        'logger.channel.logDir': '/var/log/medplum/channels',
        'logger.channel.logLevel': 'INFO',
        'logger.channel.maxFileSizeMb': '50',
        'logger.channel.filesToKeep': '20',
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toHaveLength(0);
      expect(config.main.logDir).toBe('/var/log/medplum');
      expect(config.main.logLevel).toBe(LogLevel.ERROR);
      expect(config.channel.logDir).toBe('/var/log/medplum/channels');
      expect(config.channel.logLevel).toBe(LogLevel.INFO);
      expect(config.main.maxFileSizeMb).toBe(100);
      expect(config.main.filesToKeep).toBe(15);
      expect(config.channel.maxFileSizeMb).toBe(50);
      expect(config.channel.filesToKeep).toBe(20);
    });

    test('should emit warning when an invalid prop name is encountered', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logDir': '/tmp/logs',
        'logger.main.invalidProp': 'someValue',
        'logger.main.anotherInvalid': 'anotherValue',
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('logger.main.invalidProp is not a valid setting name');
      expect(warnings).toContain('logger.main.anotherInvalid is not a valid setting name');
      expect(config.main.logDir).toBe('/tmp/logs');
      // Invalid props should not be set, defaults should be used
      expect(config.main.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      expect(config.main.filesToKeep).toBe(DEFAULT_LOGGER_CONFIG.filesToKeep);
      expect(config.main.logLevel).toBe(DEFAULT_LOGGER_CONFIG.logLevel);
    });

    test('should emit warning when an invalid log level is encountered', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logLevel': 'INVALID_LEVEL',
        'logger.channel.logLevel': 'ANOTHER_INVALID',
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('Error while parsing logger.main.logLevel: Invalid log level: INVALID_LEVEL');
      expect(warnings).toContain('Error while parsing logger.channel.logLevel: Invalid log level: ANOTHER_INVALID');
      // Should fallback to INFO when parsing fails
      expect(config.main.logLevel).toBe(LogLevel.INFO);
      expect(config.channel.logLevel).toBe(LogLevel.INFO);
    });

    test('should emit warning when an invalid logger type is encountered', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.invalid.logDir': '/tmp/logs',
        'logger.anotherInvalid.maxFileSizeMb': '5',
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('invalid is not a valid config type, must be main or channel');
      expect(warnings).toContain('anotherInvalid is not a valid config type, must be main or channel');
      // Should use defaults since invalid types are ignored
      expect(config.main.logDir).toBe(DEFAULT_LOGGER_CONFIG.logDir);
      expect(config.main.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      expect(config.channel.logDir).toBe(DEFAULT_LOGGER_CONFIG.logDir);
      expect(config.channel.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
    });

    test('should emit warning when logDir is an invalid value', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logDir': '', // Empty string
        'logger.main.logLevel': 'DEBUG', // Valid value to ensure other configs work
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('logger.main.logDir must be a valid filepath string');
      // Invalid logDir should be cleaned up and default used
      expect(config.main.logDir).toBe(DEFAULT_LOGGER_CONFIG.logDir);
      // Other valid configs should still work
      expect(config.main.logLevel).toBe(LogLevel.DEBUG);
    });

    test('should emit warning when maxFileSizeMb is an invalid value', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.maxFileSizeMb': '0', // Zero
        'logger.channel.maxFileSizeMb': '-5', // Negative
        'logger.main.logDir': '/tmp/logs', // Valid value to ensure other configs work
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('logger.main.maxFileSizeMb must be a valid integer');
      expect(warnings).toContain('logger.channel.maxFileSizeMb must be a valid integer');
      // Invalid maxFileSizeMb should be cleaned up and default used
      expect(config.main.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      expect(config.channel.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      // Other valid configs should still work
      expect(config.main.logDir).toBe('/tmp/logs');
    });

    test('should emit warning when filesToKeep is an invalid value', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.filesToKeep': '0', // Zero
        'logger.channel.filesToKeep': '-3', // Negative
        'logger.main.logDir': '/tmp/logs', // Valid value to ensure other configs work
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('logger.main.filesToKeep must be a valid integer');
      expect(warnings).toContain('logger.channel.filesToKeep must be a valid integer');
      // Invalid filesToKeep should be cleaned up and default used
      expect(config.main.filesToKeep).toBe(DEFAULT_LOGGER_CONFIG.filesToKeep);
      expect(config.channel.filesToKeep).toBe(DEFAULT_LOGGER_CONFIG.filesToKeep);
      // Other valid configs should still work
      expect(config.main.logDir).toBe('/tmp/logs');
    });

    test('should emit warning when logLevel is an invalid value', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logLevel': '99', // Invalid number
        'logger.channel.logLevel': '-1', // Invalid number
        'logger.main.logLevel2': 'INVALID', // Invalid string (renamed to avoid duplicate)
        'logger.main.logDir': '/tmp/logs', // Valid value to ensure other configs work
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('Error while parsing logger.main.logLevel: Invalid log level: 99');
      expect(warnings).toContain('Error while parsing logger.channel.logLevel: Invalid log level: -1');
      expect(warnings).toContain('logger.main.logLevel2 is not a valid setting name');
      // Invalid logLevel should be cleaned up and default used
      expect(config.main.logLevel).toBe(LogLevel.INFO); // Falls back to INFO from parseLogLevel error
      expect(config.channel.logLevel).toBe(LogLevel.INFO); // Falls back to INFO from parseLogLevel error
      // Other valid configs should still work
      expect(config.main.logDir).toBe('/tmp/logs');
    });

    test('should handle mixed valid and invalid configurations', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logDir': '/tmp/logs', // Valid
        'logger.main.filesToKeep': 'invalid', // Invalid
        'logger.main.logLevel': 'DEBUG', // Valid
        'logger.channel.logDir': '', // Invalid
        'logger.channel.logLevel': 'INVALID_LEVEL', // Invalid
        'logger.main.invalidProp': 'should-warn', // Invalid prop
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toContain('logger.main.filesToKeep must be a valid integer');
      expect(warnings).toContain('logger.channel.logDir must be a valid filepath string');
      expect(warnings).toContain('Error while parsing logger.channel.logLevel: Invalid log level: INVALID_LEVEL');
      expect(warnings).toContain('logger.main.invalidProp is not a valid setting name');

      // Valid configs should be preserved
      expect(config.main.logDir).toBe('/tmp/logs');
      expect(config.main.logLevel).toBe(LogLevel.DEBUG);

      // Invalid configs should use defaults
      expect(config.main.filesToKeep).toBe(DEFAULT_LOGGER_CONFIG.filesToKeep);
      expect(config.channel.logDir).toBe(DEFAULT_LOGGER_CONFIG.logDir);
      expect(config.channel.logLevel).toBe(LogLevel.INFO); // Fallback from parseLogLevel error

      // Values not specified should also use defaults
      expect(config.main.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      expect(config.channel.maxFileSizeMb).toBe(DEFAULT_LOGGER_CONFIG.maxFileSizeMb);
      expect(config.channel.filesToKeep).toBe(DEFAULT_LOGGER_CONFIG.filesToKeep);
    });

    test('should handle undefined values gracefully', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
        'logger.main.logDir': undefined,
        'logger.main.logLevel': 'DEBUG',
        'logger.channel.logLevel': undefined,
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      // Should not have warnings for undefined values (they're skipped)
      expect(warnings).toHaveLength(0);
      expect(config.main.logDir).toBe(DEFAULT_LOGGER_CONFIG.logDir);
      expect(config.main.logLevel).toBe(LogLevel.DEBUG);
      expect(config.channel.logLevel).toBe(DEFAULT_LOGGER_CONFIG.logLevel);
    });

    test('should handle args object without logger config options', () => {
      const args: AgentArgs = {
        baseUrl: 'https://api.medplum.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        agentId: 'test-agent-id',
      };

      const [config, warnings] = parseLoggerConfigFromArgs(args);

      expect(warnings).toHaveLength(0);
      expect(config.main).toEqual(DEFAULT_LOGGER_CONFIG);
      expect(config.channel).toEqual(DEFAULT_LOGGER_CONFIG);
    });
  });

  describe('getWinstonLevelFromMedplumLevel', () => {
    test.each([
      ['NONE', 'error'],
      ['ERROR', 'error'],
      ['WARN', 'warn'],
      ['INFO', 'info'],
      ['DEBUG', 'debug'],
    ] as [(typeof LogLevelNames)[number], string][])('%s => %s', (medplumLogLevel, winstonLogLevel) => {
      expect(getWinstonLevelFromMedplumLevel(parseLogLevel(medplumLogLevel))).toStrictEqual(winstonLogLevel);
    });
    test('invalid input throws', () => {
      expect(() => getWinstonLevelFromMedplumLevel(100)).toThrow('Invalid log level');
    });
  });

  describe('WinstonWrapperLogger', () => {
    let logger: WinstonWrapperLogger;
    let consoleSpy: {
      log: jest.SpyInstance;
      warn: jest.SpyInstance;
      error: jest.SpyInstance;
    };

    beforeEach(() => {
      // Spy on console methods that winston uses
      consoleSpy = {
        log: jest.spyOn(console, 'log').mockImplementation(() => {}),
        warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
        error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      };

      // Create a logger with a custom config
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logLevel: LogLevel.INFO,
      };

      logger = new WinstonWrapperLogger(config, LoggerType.MAIN);
    });

    afterEach(() => {
      // Restore console methods
      consoleSpy.log.mockRestore();
      consoleSpy.warn.mockRestore();
      consoleSpy.error.mockRestore();
    });

    test('should not log anything when log level is lower than level of a log message', () => {
      // Set logger to WARN level, so DEBUG and INFO should be filtered out
      logger.level = LogLevel.WARN;

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      // With forceConsole: true, all levels go to console.log
      // DEBUG and INFO should not be logged (filtered out)
      // WARN and ERROR should be logged
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    test('should handle data being an Error', () => {
      const error = new Error('Test error message');
      error.stack = 'Error: Test error message\n    at test (test.js:1:1)';

      logger.error('Error occurred', error);

      expect(consoleSpy.log).toHaveBeenCalled();
      // Check that the error was serialized properly by examining the call
      const errorCall = consoleSpy.log.mock.calls[0][0];
      expect(errorCall).toContain('Error occurred');
      expect(errorCall).toContain('Error: Test error message');
    });

    test('.debug logs message of level DEBUG', () => {
      // Create a logger with DEBUG level
      const debugLogger = new WinstonWrapperLogger(
        { ...DEFAULT_LOGGER_CONFIG, logLevel: LogLevel.DEBUG },
        LoggerType.MAIN
      );

      debugLogger.debug('Debug message', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalled();
      const debugCall = consoleSpy.log.mock.calls[0][0];
      expect(debugCall).toContain('Debug message');
      expect(debugCall).toContain('"key":"value"');
    });

    test('.info logs message of level INFO', () => {
      logger.info('Info message', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalled();
      const infoCall = consoleSpy.log.mock.calls[0][0];
      expect(infoCall).toContain('Info message');
      expect(infoCall).toContain('"key":"value"');
    });

    test('.warn logs message of level WARN', () => {
      logger.warn('Warn message', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalled();
      const warnCall = consoleSpy.log.mock.calls[0][0];
      expect(warnCall).toContain('Warn message');
      expect(warnCall).toContain('"key":"value"');
    });

    test('.error logs message of level ERROR', () => {
      logger.error('Error message', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalled();
      const errorCall = consoleSpy.log.mock.calls[0][0];
      expect(errorCall).toContain('Error message');
      expect(errorCall).toContain('"key":"value"');
    });

    test('.clone should use parent logger winston instance', () => {
      const clonedLogger = logger.clone();

      // The cloned logger should use the same winston instance as the parent
      expect(clonedLogger.getWinston()).toBe(logger.getWinston());

      // Test that both loggers log to the same winston instance
      logger.info('Parent message');
      clonedLogger.info('Clone message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      const parentCall = consoleSpy.log.mock.calls[0][0];
      const cloneCall = consoleSpy.log.mock.calls[1][0];
      expect(parentCall).toContain('Parent message');
      expect(cloneCall).toContain('Clone message');
    });

    test('.clone should work with a prefix', () => {
      const clonedLogger = logger.clone({
        options: { prefix: '[TEST] ' },
      });

      // The cloned logger should use the same winston instance as the parent
      expect(clonedLogger.getWinston()).toBe(logger.getWinston());

      clonedLogger.info('Test message');

      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('[TEST] Test message');
    });

    test('should override metadata when cloning', () => {
      const loggerWithMetadata = new WinstonWrapperLogger(
        { ...DEFAULT_LOGGER_CONFIG, logLevel: LogLevel.INFO },
        LoggerType.MAIN,
        { metadata: { service: 'test-service' } }
      );

      const clonedLogger = loggerWithMetadata.clone({
        metadata: { requestId: '123' },
      });

      // The cloned logger should use the same winston instance as the parent
      expect(clonedLogger.getWinston()).toBe(loggerWithMetadata.getWinston());

      clonedLogger.info('Test message', { userId: '456' });

      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('Test message');
      expect(call).toContain('"requestId":"123"');
      expect(call).toContain('"userId":"456"');
      // The clone method overrides metadata entirely, it doesn't merge
      expect(call).not.toContain('"service":"test-service"');
    });

    test('should handle log method with different levels', () => {
      // Create a logger with DEBUG level to allow all levels
      const debugLogger = new WinstonWrapperLogger(
        { ...DEFAULT_LOGGER_CONFIG, logLevel: LogLevel.DEBUG },
        LoggerType.MAIN
      );

      debugLogger.log(LogLevel.DEBUG, 'Debug via log method');
      debugLogger.log(LogLevel.INFO, 'Info via log method');
      debugLogger.log(LogLevel.WARN, 'Warn via log method');
      debugLogger.log(LogLevel.ERROR, 'Error via log method');

      // With forceConsole: true, all levels go to console.log
      expect(consoleSpy.log).toHaveBeenCalledTimes(4); // DEBUG, INFO, WARN, ERROR
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();

      const debugCall = consoleSpy.log.mock.calls[0][0];
      const infoCall = consoleSpy.log.mock.calls[1][0];
      const warnCall = consoleSpy.log.mock.calls[2][0];
      const errorCall = consoleSpy.log.mock.calls[3][0];

      expect(debugCall).toContain('Debug via log method');
      expect(infoCall).toContain('Info via log method');
      expect(warnCall).toContain('Warn via log method');
      expect(errorCall).toContain('Error via log method');
    });

    test('should handle Error object in log method', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test (test.js:1:1)';

      logger.log(LogLevel.ERROR, 'Error occurred', error);

      expect(consoleSpy.log).toHaveBeenCalled();
      const errorCall = consoleSpy.log.mock.calls[0][0];
      expect(errorCall).toContain('Error occurred');
      expect(errorCall).toContain('Error: Test error');
    });

    test('should preserve prefix when cloning with existing prefix', () => {
      const loggerWithPrefix = new WinstonWrapperLogger(
        { ...DEFAULT_LOGGER_CONFIG, logLevel: LogLevel.INFO },
        LoggerType.MAIN,
        { prefix: '[PARENT] ' }
      );

      const clonedLogger = loggerWithPrefix.clone({
        options: { prefix: '[CHILD] ' },
      });

      // The cloned logger should use the same winston instance as the parent
      expect(clonedLogger.getWinston()).toBe(loggerWithPrefix.getWinston());

      clonedLogger.info('Test message');

      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('[CHILD] Test message');
    });

    test('should use parent logger winston instance when parent is provided', () => {
      const parentLogger = new WinstonWrapperLogger(
        { ...DEFAULT_LOGGER_CONFIG, logLevel: LogLevel.INFO },
        LoggerType.MAIN
      );

      const childLogger = new WinstonWrapperLogger(
        { ...DEFAULT_LOGGER_CONFIG, logLevel: LogLevel.INFO },
        LoggerType.CHANNEL,
        { parentLogger }
      );

      expect(childLogger.getWinston()).toBe(parentLogger.getWinston());

      childLogger.info('Child message');
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('Child message');
    });
  });

  describe('createWinstonFromLoggerConfig', () => {
    let tempDir: string;
    let originalNodeEnv: string | undefined;

    beforeAll(() => {
      console.log = jest.fn();
    });

    beforeEach(async () => {
      // Create a temporary directory for test logs
      tempDir = await mkdtemp(join(tmpdir(), 'medplum-logger-test-'));

      // Store original NODE_ENV and set to non-test
      originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
    });

    afterEach(async () => {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;

      // Clean up temporary directory
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (_error) {
        // Ignore cleanup errors
      }
    });

    test('should create winston logger with console transport in test environment', () => {
      // Set NODE_ENV back to test for this specific test
      process.env.NODE_ENV = 'test';

      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      expect(logger).toBeDefined();
      expect(logger.transports).toHaveLength(1);
      expect((logger.transports[0] as any).name).toBe('console');

      // Restore NODE_ENV for other tests
      process.env.NODE_ENV = 'production';
    });

    test('should create winston logger with daily rotate transport in non-test environment', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
        maxFileSizeMb: 5,
        filesToKeep: 3,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      expect(logger).toBeDefined();
      expect(logger.transports).toHaveLength(2); // console + daily rotate

      const dailyRotateTransport = logger.transports.find((t) => (t as any).name === 'dailyRotateFile');
      expect(dailyRotateTransport).toBeDefined();
    });

    test('should create correct filename for main logger type', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);
      const dailyRotateTransport = logger.transports.find((t) => (t as any).name === 'dailyRotateFile');

      expect(dailyRotateTransport).toBeDefined();
      // The filename should contain 'medplum-agent-main'
      expect((dailyRotateTransport as any).options.filename).toContain('medplum-agent-main');
    });

    test('should create correct filename for channel logger type', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.CHANNEL);
      const dailyRotateTransport = logger.transports.find((t) => (t as any).name === 'dailyRotateFile');

      expect(dailyRotateTransport).toBeDefined();
      // The filename should contain 'medplum-agent-channels'
      expect((dailyRotateTransport as any).options.filename).toContain('medplum-agent-channels');
    });

    test('should use correct dirname from config', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);
      const dailyRotateTransport = logger.transports.find((t) => (t as any).name === 'dailyRotateFile');

      expect(dailyRotateTransport).toBeDefined();
      // The dirname property is stored in the options
      expect((dailyRotateTransport as any).options.dirname).toBe(tempDir);
    });

    test('should use correct maxSize from config', () => {
      const maxFileSizeMb = 15;
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
        maxFileSizeMb,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);
      const dailyRotateTransport = logger.transports.find((t) => (t as any).name === 'dailyRotateFile');

      expect(dailyRotateTransport).toBeDefined();
      // The maxSize property is stored in the options
      expect((dailyRotateTransport as any).options.maxSize).toBe(`${maxFileSizeMb}m`);
    });

    test('should use correct maxFiles from config', () => {
      const filesToKeep = 7;
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
        filesToKeep,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);
      const dailyRotateTransport = logger.transports.find((t) => (t as any).name === 'dailyRotateFile');

      expect(dailyRotateTransport).toBeDefined();
      // The maxFiles property is stored in the options
      expect((dailyRotateTransport as any).options.maxFiles).toBe(filesToKeep);
    });

    test('should set correct log level from config', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.DEBUG,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      expect(logger.level).toBe('debug');
    });

    test('should set logger to silent when log level is NONE', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.NONE,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      expect(logger.silent).toBe(true);
    });

    test('should not be silent when log level is not NONE', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      expect(logger.silent).toBe(false);
    });

    test('should have error handler attached to daily rotate transport', () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);
      const dailyRotateTransport = logger.transports.find((t) => (t as any).name === 'dailyRotateFile');

      expect(dailyRotateTransport).toBeDefined();

      // Check that the error handler is attached by examining the listeners
      const listeners = (dailyRotateTransport as any).listeners('error');
      expect(listeners.length).toBeGreaterThan(0);

      // The error handler should be a function that calls console.error
      const errorHandler = listeners[0];
      expect(typeof errorHandler).toBe('function');
    });

    test('should create log files when logging messages', async () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      // Log some messages
      logger.info('Test info message', { testData: 'value' });
      logger.warn('Test warn message', { testData: 'value2' });
      logger.error('Test error message', { testData: 'value3' });

      // Give winston time to write to file
      await sleep(100);

      // Check if log files were created
      const fs = await import('fs/promises');
      const files = await fs.readdir(tempDir);
      const logFiles = files.filter((file) => file.includes('medplum-agent-main'));

      expect(logFiles.length).toBeGreaterThan(0);

      // Check that the log file contains our messages
      const logFile = logFiles[0];
      const logContent = await fs.readFile(join(tempDir, logFile), 'utf-8');
      expect(logContent).toContain('Test info message');
      expect(logContent).toContain('Test warn message');
      expect(logContent).toContain('Test error message');
    });

    test('should format log messages correctly with timestamp and level transformation', async () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.INFO,
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      // Log a message
      logger.info('Test message', { key: 'value' });

      // Give winston time to write to file
      await sleep(100);

      // Check the log file content
      const fs = await import('fs/promises');
      const files = await fs.readdir(tempDir);
      const logFiles = files.filter((file) => file.includes('medplum-agent-main'));

      expect(logFiles.length).toBeGreaterThan(0);

      const logContent = await fs.readFile(join(tempDir, logFiles[0]), 'utf-8');
      const logLines = logContent.trim().split('\n');
      const logEntry = JSON.parse(logLines[logLines.length - 1]);

      // Check the format transformation
      expect(logEntry.level).toBe('INFO'); // Should be uppercase
      expect(logEntry.msg).toBe('Test message'); // Should be 'msg' not 'message'
      expect(logEntry.key).toBe('value');
      expect(logEntry.timestamp).toBeDefined(); // Should have timestamp
    });

    test('should respect log level filtering', async () => {
      const config = {
        ...DEFAULT_LOGGER_CONFIG,
        logDir: tempDir,
        logLevel: LogLevel.WARN, // Only WARN and ERROR should be logged
      };

      const logger = createWinstonFromLoggerConfig(config, LoggerType.MAIN);

      // Log messages at different levels
      logger.debug('Debug message'); // Should be filtered out
      logger.info('Info message'); // Should be filtered out
      logger.warn('Warn message'); // Should be logged
      logger.error('Error message'); // Should be logged

      // Give winston time to write to file
      await sleep(100);

      // Check the log file content
      const fs = await import('fs/promises');
      const files = await fs.readdir(tempDir);
      const logFiles = files.filter((file) => file.includes('medplum-agent-main'));

      const logContent = await fs.readFile(join(tempDir, logFiles[0]), 'utf-8');

      // Should not contain debug or info messages
      expect(logContent).not.toContain('Debug message');
      expect(logContent).not.toContain('Info message');

      // Should contain warn and error messages
      expect(logContent).toContain('Warn message');
      expect(logContent).toContain('Error message');
    });
  });
});
