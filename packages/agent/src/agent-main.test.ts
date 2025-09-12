// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ILogger, LogLevel, sleep } from '@medplum/core';
import fs from 'node:fs';
import { agentMain } from './agent-main';
import { App } from './app';
import * as loggerModule from './logger';

function mockLogger(level: LogLevel = LogLevel.INFO): ILogger & { log: jest.Mock } {
  return {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    clone: jest.fn(),
    level,
  };
}

jest.mock('./constants', () => ({
  RETRY_WAIT_DURATION_MS: 150,
}));

describe('Main', () => {
  beforeEach(() => {
    console.log = jest.fn();

    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    jest.spyOn(App.prototype, 'start').mockImplementation(() => Promise.resolve());

    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          access_token: 'foo',
        }),
      } as Response;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Missing arguments', async () => {
    await expect(agentMain(['node', 'index.js'])).rejects.toThrow('process.exit');
    expect(console.log).toHaveBeenCalledWith('Missing arguments');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('Help command', async () => {
    try {
      await agentMain(['node', 'index.js', '--help']);
    } catch (err: any) {
      expect(err.message).toBe('process.exit');
    }
    expect(console.log).toHaveBeenCalledWith('Expected arguments:');
    expect(process.exit).toHaveBeenLastCalledWith(0);

    (console.log as jest.Mock).mockClear();

    try {
      await agentMain(['node', 'index.js', '-h']);
    } catch (err: any) {
      expect(err.message).toBe('process.exit');
    }
    expect(console.log).toHaveBeenCalledWith('Expected arguments:');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('Command line arguments success', async () => {
    const app = await agentMain(['node', 'index.js', 'http://example.com', 'clientId', 'clientSecret', 'agentId']);
    await app.stop();
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('Empty properties file', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');

    await expect(agentMain([])).rejects.toThrow('process.exit');
    expect(console.log).toHaveBeenCalledWith('Missing arguments');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('Properties file success', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValueOnce(
        [
          'baseUrl=http://example.com',
          'clientId=clientId',
          'clientSecret=clientSecret',
          'agentId=agentId',
          'logLevel=DEBUG',
        ].join('\n')
      );
    const app = await agentMain(['node', 'index.js']);
    expect(app.log.level).toStrictEqual(LogLevel.DEBUG);
    await app.stop();
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('Agent should retry client login when network is down', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('Fetch failed');
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());

    const appPromise = agentMain(['node', 'index.js', 'http://example.com', 'clientId', 'clientSecret', 'agentId']);

    while (fetchSpy.mock.calls.length !== 3) {
      await sleep(100);
    }

    // fetchWithRetry tries to fetch 3 times per attempt before throwing
    expect(fetchSpy).toHaveBeenCalledWith('http://example.com/oauth2/token', {
      body: 'grant_type=client_credentials&client_id=clientId&client_secret=clientSecret',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to login',
      expect.objectContaining({ err: expect.any(String) })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Retrying login'));

    fetchSpy.mockClear();
    consoleErrorSpy.mockClear();
    (console.log as jest.Mock).mockClear();

    while (fetchSpy.mock.calls.length !== 3) {
      await sleep(100);
    }

    // Let it try and fail again
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to login',
      expect.objectContaining({ err: expect.any(String) })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Retrying login'));

    fetchSpy.mockClear();
    consoleErrorSpy.mockClear();
    (console.log as jest.Mock).mockClear();

    // Finally restore original fetch implementation and allow it to succeed
    fetchSpy.mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          access_token: 'foo',
        }),
      } as Response;
    });

    while (!fetchSpy.mock.calls.length) {
      await sleep(100);
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith('Retrying login');

    const app = await appPromise;
    await app.stop();

    consoleErrorSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('Warnings from logger config parsing are logged', async () => {
    // Mock a logger that has warnings
    const mockMainLogger = mockLogger(LogLevel.INFO);
    const mockChannelLogger = mockLogger(LogLevel.INFO);

    // Mock the WinstonWrapperLogger constructor to return our mock
    const WinstonWrapperLoggerMock = jest.fn().mockImplementation((config, loggerType) => {
      if (loggerType === 'main') {
        return mockMainLogger;
      } else {
        return mockChannelLogger;
      }
    });

    // Mock parseLoggerConfigFromArgs to return warnings
    const mockParseLoggerConfigFromArgs = jest.fn().mockReturnValue([
      {
        main: { logDir: '/tmp', maxFileSizeMb: 10, filesToKeep: 10, logLevel: LogLevel.INFO },
        channel: { logDir: '/tmp', maxFileSizeMb: 10, filesToKeep: 10, logLevel: LogLevel.INFO },
      },
      ['Test warning message', 'Another warning message'],
    ]);

    // Mock the logger module functions directly
    jest.spyOn(loggerModule, 'WinstonWrapperLogger').mockImplementation(WinstonWrapperLoggerMock);
    jest.spyOn(loggerModule, 'parseLoggerConfigFromArgs').mockImplementation(mockParseLoggerConfigFromArgs);

    await agentMain(['node', 'index.js', 'http://example.com', 'clientId', 'clientSecret', 'agentId']);

    // Verify that the warnings were logged
    expect(mockMainLogger.warn).toHaveBeenCalledWith('Test warning message');
    expect(mockMainLogger.warn).toHaveBeenCalledWith('Another warning message');
    expect(mockMainLogger.warn).toHaveBeenCalledTimes(2);
  });

  test('Command line log level overrides agent.properties log level', async () => {
    // Mock existsSync to return true for agent.properties
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    // Mock readFileSync to return properties with DEBUG log level
    jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(
        [
          'baseUrl=http://example.com',
          'clientId=clientId',
          'clientSecret=clientSecret',
          'agentId=agentId',
          'logger.main.logLevel=DEBUG',
        ].join('\n')
      );

    // Create a mock logger to capture the config
    let capturedMainLoggerConfig!: loggerModule.AgentLoggerConfig;
    let capturedChannelLoggerConfig!: loggerModule.AgentLoggerConfig;

    const WinstonWrapperLoggerMock = jest.fn().mockImplementation((config, loggerType) => {
      if (loggerType === 'main') {
        capturedMainLoggerConfig = config;
      } else if (loggerType === 'channel') {
        capturedChannelLoggerConfig = config;
      }
      return mockLogger(config.logLevel);
    });

    // Mock parseLoggerConfigFromArgs to return empty warnings
    const mockParseLoggerConfigFromArgs = jest.fn().mockReturnValue([
      {
        main: { logDir: '/tmp', maxFileSizeMb: 10, filesToKeep: 10, logLevel: LogLevel.INFO },
        channel: { logDir: '/tmp', maxFileSizeMb: 10, filesToKeep: 10, logLevel: LogLevel.INFO },
      },
      [],
    ]);

    // Mock the logger module functions directly
    jest.spyOn(loggerModule, 'WinstonWrapperLogger').mockImplementation(WinstonWrapperLoggerMock);
    jest.spyOn(loggerModule, 'parseLoggerConfigFromArgs').mockImplementation(mockParseLoggerConfigFromArgs);

    // Call with command line log level INFO (which should override DEBUG from properties)
    const app = await agentMain([
      'node',
      'index.js',
      'http://example.com',
      'clientId',
      'clientSecret',
      'agentId',
      'INFO',
    ]);

    // Verify that both main and channel loggers were created with INFO level (overriding DEBUG from properties)
    expect(capturedMainLoggerConfig.logLevel).toBe(LogLevel.INFO);
    expect(capturedChannelLoggerConfig.logLevel).toBe(LogLevel.INFO);
    expect(app.log.level).toBe(LogLevel.INFO);

    await app.stop();
  });
});
