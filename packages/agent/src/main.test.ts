import { LogLevel } from '@medplum/core';
import fs from 'fs';
import { App } from './app';
import { main } from './main';

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
    try {
      await main(['node', 'index.js']);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toBe('process.exit');
    }
    expect(console.log).toHaveBeenCalledWith('Missing arguments');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('Help command', async () => {
    try {
      await main(['node', 'index.js', '--help']);
    } catch (err: any) {
      expect(err.message).toBe('process.exit');
    }
    expect(console.log).toHaveBeenCalledWith('Expected arguments:');
    expect(process.exit).toHaveBeenLastCalledWith(0);

    (console.log as jest.Mock).mockClear();

    try {
      await main(['node', 'index.js', '-h']);
    } catch (err: any) {
      expect(err.message).toBe('process.exit');
    }
    expect(console.log).toHaveBeenCalledWith('Expected arguments:');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('Command line arguments success', async () => {
    const app = await main(['node', 'index.js', 'http://example.com', 'clientId', 'clientSecret', 'agentId']);
    await app.stop();
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('Empty properties file', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    try {
      await main([]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toBe('process.exit');
    }
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
    const app = await main(['node', 'index.js']);
    expect(app.logLevel).toEqual(LogLevel.DEBUG);
    await app.stop();
    expect(process.exit).not.toHaveBeenCalled();
  });
});
