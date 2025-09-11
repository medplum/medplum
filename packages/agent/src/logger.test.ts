// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { LogLevel } from '@medplum/core';
import { DEFAULT_LOGGER_CONFIG, parseLoggerConfigFromArgs } from './logger';
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
});
