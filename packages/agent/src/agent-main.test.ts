import { LogLevel, sleep } from '@medplum/core';
import fs from 'node:fs';
import { agentMain } from './agent-main';
import { App } from './app';

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
      .mockReturnValue(
        [
          'baseUrl=http://example.com',
          'clientId=clientId',
          'clientSecret=clientSecret',
          'agentId=agentId',
          'logLevel=DEBUG',
        ].join('\n')
      );
    const app = await agentMain(['node', 'index.js']);
    expect(app.logLevel).toStrictEqual(LogLevel.DEBUG);
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
});
