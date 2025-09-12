// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { LogLevel, LogLevelNames, parseLogLevel } from '@medplum/core';
import { DEFAULT_LOGGER_CONFIG, getWinstonLevelFromMedplumLevel, LoggerType, parseLoggerConfigFromArgs, WinstonWrapperLogger } from './logger';
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
});
