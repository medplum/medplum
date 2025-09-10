// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { LogLevel } from '@medplum/core';
import { Agent } from '@medplum/fhirtypes';
import { FullAgentLoggerConfig, parseLoggerConfigFromAgent } from './logger';

describe('Agent Logger', () => {
  // describe('getLoggerConfig', () => {
  //   test('should throw if called before initialized', () => {
  //     getLoggerConfig();
  //   });
  // });

  describe('parseLoggerConfigFromAgent', () => {
    test.each([
      [
        {
          resourceType: 'Agent',
          name: 'Test Agent',
          status: 'active',
          setting: [
            {
              name: 'logger.main.logDir',
              valueString: 'TEST_DIR',
            },
          ],
        },
        0,
        {
          main: {
            logDir: 'TEST_DIR',
            maxFileSizeMb: 10,
            filesToKeep: 10,
            logLevel: LogLevel.INFO,
          },
          channel: {
            logDir: __dirname,
            maxFileSizeMb: 10,
            filesToKeep: 10,
            logLevel: LogLevel.INFO,
          },
        },
      ],
      [
        {
          resourceType: 'Agent',
          name: 'Test Agent',
          status: 'active',
          setting: [
            {
              name: 'logger.channel.logDir',
              valueString: 'TEST_DIR',
            },
          ],
        },
        0,
        {
          main: {
            logDir: __dirname,
            maxFileSizeMb: 10,
            filesToKeep: 10,
            logLevel: LogLevel.INFO,
          },
          channel: {
            logDir: 'TEST_DIR',
            maxFileSizeMb: 10,
            filesToKeep: 10,
            logLevel: LogLevel.INFO,
          },
        },
      ],
      [
        {
          resourceType: 'Agent',
          name: 'Test Agent',
          status: 'active',
          setting: [
            {
              name: 'logger.main.logDir',
              valueString: 'TEST_DIR',
            },
            // Invalid property, should emit warning
            {
              name: 'logger.main.logFileName',
              valueString: 'TEST_FILE',
            },
            // Invalid property, should emit warning
            {
              name: 'logger.channel.logPriority',
              valueString: 'high',
            },
            {
              name: 'logger.channel.logLevel',
              valueString: 'DEBUG',
            },
          ],
        },
        2,
        {
          main: {
            logDir: 'TEST_DIR',
            maxFileSizeMb: 10,
            filesToKeep: 10,
            logLevel: LogLevel.INFO,
          },
          channel: {
            logDir: __dirname,
            maxFileSizeMb: 10,
            filesToKeep: 10,
            logLevel: LogLevel.DEBUG,
          },
        },
      ],
    ] as [Agent, number, FullAgentLoggerConfig][])(
      'should parse successfully with a valid Agent logger config',
      (agentConfig, warningCount, loggerConfig) => {
        const [config, warnings] = parseLoggerConfigFromAgent(agentConfig);
        expect(warnings.length).toStrictEqual(warningCount);
        expect(config).toMatchObject<FullAgentLoggerConfig>(loggerConfig);
      }
    );

    test('should throw when given an invalid logger config setting', () => {
      expect(() =>
        parseLoggerConfigFromAgent({
          resourceType: 'Agent',
          name: 'Test Agent',
          status: 'active',
          setting: [
            {
              name: 'logger.channel.maxFileSizeMb',
              // Invalid value, only valueInteger values are valid
              valueString: '100',
            },
          ],
        })
      ).toThrow();

      expect(() =>
        parseLoggerConfigFromAgent({
          resourceType: 'Agent',
          name: 'Test Agent',
          status: 'active',
          setting: [
            {
              // Invalid logger name 'foo'
              name: 'logger.foo.maxFileSizeMb',
              valueInteger: 100,
            },
          ],
        })
      ).toThrow();

      expect(() =>
        parseLoggerConfigFromAgent({
          resourceType: 'Agent',
          name: 'Test Agent',
          status: 'active',
          setting: [
            {
              name: 'logger.main.logLevel',
              // Invalid log level value
              valueString: 'TRACE',
            },
          ],
        })
      ).toThrow();
    });
  });
});
