// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel, sleep } from '@medplum/core';
import { existsSync, readFileSync } from 'node:fs';
import type { Mock } from 'vitest';
import { agentMain } from './agent-main';
import { App } from './app';
import * as loggerModule from './logger';
import type * as AgentConstants from './constants';
import { createMockLogger } from './test-utils';

vi.mock('./constants', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentConstants>();
  return {
    ...actual,
    RETRY_WAIT_DURATION_MS: 150,
  };
});

describe('Main', () => {
  beforeEach(() => {
    console.log = vi.fn();

    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    vi.spyOn(App.prototype, 'start').mockImplementation(() => Promise.resolve());

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          access_token: 'foo',
        }),
      } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    (console.log as Mock).mockClear();

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

  test('Command line arguments with optional logLevel', async () => {
    const WinstonWrapperLoggerMock = vi.fn(function (config: { logLevel: LogLevel }) {
      return createMockLogger(config.logLevel);
    });
    vi.spyOn(loggerModule, 'WinstonWrapperLogger').mockImplementation(WinstonWrapperLoggerMock);

    const app = await agentMain([
      'node',
      'index.js',
      'http://example.com',
      'clientId',
      'clientSecret',
      'agentId',
      'DEBUG',
    ]);

    // Verify both loggers were created with DEBUG level
    expect(app.log.level).toStrictEqual(LogLevel.DEBUG);
    expect(app.channelLog.level).toStrictEqual(LogLevel.DEBUG);

    await app.stop();
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('Empty properties file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');

    await expect(agentMain([])).rejects.toThrow('process.exit');
    expect(console.log).toHaveBeenCalledWith('Missing arguments');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('Properties file success', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValueOnce(
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('Fetch failed');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

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
    (console.log as Mock).mockClear();

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
    (console.log as Mock).mockClear();

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
    const mockMainLogger = createMockLogger(LogLevel.INFO);
    const mockChannelLogger = createMockLogger(LogLevel.INFO);

    // Mock the WinstonWrapperLogger constructor to return our mock
    const WinstonWrapperLoggerMock = vi.fn(function (_config: unknown, loggerType: string) {
      if (loggerType === 'main') {
        return mockMainLogger;
      } else {
        return mockChannelLogger;
      }
    });

    // Mock parseLoggerConfigFromArgs to return warnings
    const mockParseLoggerConfigFromArgs = vi.fn().mockReturnValue([
      {
        main: { logDir: '/tmp', maxFileSizeMb: 10, filesToKeep: 10, logLevel: LogLevel.INFO },
        channel: { logDir: '/tmp', maxFileSizeMb: 10, filesToKeep: 10, logLevel: LogLevel.INFO },
      },
      ['Test warning message', 'Another warning message'],
    ]);

    // Mock the logger module functions directly
    vi.spyOn(loggerModule, 'WinstonWrapperLogger').mockImplementation(WinstonWrapperLoggerMock);
    vi.spyOn(loggerModule, 'parseLoggerConfigFromArgs').mockImplementation(mockParseLoggerConfigFromArgs);

    await agentMain(['node', 'index.js', 'http://example.com', 'clientId', 'clientSecret', 'agentId']);

    // Verify that the warnings were logged
    expect(mockMainLogger.warn).toHaveBeenCalledWith('Test warning message');
    expect(mockMainLogger.warn).toHaveBeenCalledWith('Another warning message');
    expect(mockMainLogger.warn).toHaveBeenCalledTimes(2);
  });

  test('Command line log level overrides agent.properties log level', async () => {
    // Mock existsSync to return true for agent.properties
    vi.mocked(existsSync).mockReturnValue(true);

    // Mock readFileSync to return properties with DEBUG log level
    vi.mocked(readFileSync).mockReturnValue(
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

    const WinstonWrapperLoggerMock = vi.fn(function (config: loggerModule.AgentLoggerConfig, loggerType: string) {
      if (loggerType === 'main') {
        capturedMainLoggerConfig = config;
      } else if (loggerType === 'channel') {
        capturedChannelLoggerConfig = config;
      }
      return createMockLogger(config.logLevel);
    });

    // Mock the logger module functions directly
    vi.spyOn(loggerModule, 'WinstonWrapperLogger').mockImplementation(WinstonWrapperLoggerMock);

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
