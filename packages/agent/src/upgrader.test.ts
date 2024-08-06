import child_process from 'node:child_process';
import fs from 'node:fs';
import os, { platform } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { upgraderMain } from './upgrader';
import { mockFetchForUpgrader } from './upgrader-test-utils';
import { clearReleaseCache, getReleaseBinPath } from './upgrader-utils';

jest.mock('node:process', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return new (class MockProcess extends require('node:events') {
    send = jest.fn().mockImplementation((msg) => {
      this.emit('childSend', msg);
    });
    exit = jest.fn(() => {
      throw new Error('process.exit');
    });
  })();
});

describe('Upgrader', () => {
  describe('Unsupported platforms', () => {
    test.each(['darwin', 'linux'])('platform() === %s -- should error', async (_platform) => {
      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(() => _platform as ReturnType<typeof platform>);
      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).rejects.toThrow(
        `Unsupported platform: ${_platform}. Agent upgrader currently only supports Windows`
      );
      platformSpy.mockRestore();
    });
  });

  describe('Windows', () => {
    let platformSpy: jest.SpyInstance;

    beforeAll(() => {
      platformSpy = jest.spyOn(os, 'platform').mockImplementation(() => 'win32');
    });

    afterAll(() => {
      platformSpy.mockRestore();
    });

    beforeEach(() => {
      clearReleaseCache();
    });

    test.each([false, true])('Happy path -- installer downloaded: %s', async (installerDownloaded) => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => installerDownloaded);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(jest.fn());
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(jest.fn());

      const receivedMsgPromise = new Promise<{ type: string }>((resolve) => {
        process.on('childSend', (msg) => {
          process.emit('disconnect');
          resolve(msg);
        });
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).resolves.toBeUndefined();
      await expect(receivedMsgPromise).resolves.toEqual({ type: 'STARTED' });
      expect(existsSyncSpy).toHaveBeenNthCalledWith(1, resolve(__dirname, 'medplum-agent-installer-3.1.6.exe'));
      expect(getReleaseBinPath('3.1.6').endsWith('medplum-agent-installer-3.1.6.exe')).toEqual(true);
      expect(spawnSyncSpy).toHaveBeenLastCalledWith(getReleaseBinPath('3.1.6'), ['/S']);
      expect(execSyncSpy).toHaveBeenLastCalledWith('net stop "Medplum Agent"');
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Finished upgrade'));

      expect(fetchSpy).toHaveBeenCalledTimes(installerDownloaded ? 1 : 2);

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Service already stopped', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(jest.fn());
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(
        jest.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );

      const receivedMsgPromise = new Promise<{ type: string }>((resolve) => {
        process.on('childSend', (msg) => {
          process.emit('disconnect');
          resolve(msg);
        });
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).resolves.toBeUndefined();
      await expect(receivedMsgPromise).resolves.toEqual({ type: 'STARTED' });
      expect(existsSyncSpy).toHaveBeenNthCalledWith(1, resolve(__dirname, 'medplum-agent-installer-3.1.6.exe'));
      expect(getReleaseBinPath('3.1.6').endsWith('medplum-agent-installer-3.1.6.exe')).toEqual(true);
      expect(spawnSyncSpy).toHaveBeenLastCalledWith(getReleaseBinPath('3.1.6'), ['/S']);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Agent service not running, skipping stopping the service')
      );
      expect(execSyncSpy).toHaveBeenLastCalledWith('net stop "Medplum Agent"');
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Finished upgrade'));
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Installer fails', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(
        jest.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(jest.fn());

      const receivedMsgPromise = new Promise<{ type: string }>((resolve) => {
        process.on('childSend', (msg) => {
          process.emit('disconnect');
          resolve(msg);
        });
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).resolves.toBeUndefined();
      await expect(receivedMsgPromise).resolves.toEqual({ type: 'STARTED' });
      expect(existsSyncSpy).toHaveBeenNthCalledWith(1, resolve(__dirname, 'medplum-agent-installer-3.1.6.exe'));
      expect(getReleaseBinPath('3.1.6').endsWith('medplum-agent-installer-3.1.6.exe')).toEqual(true);
      expect(spawnSyncSpy).toHaveBeenLastCalledWith(getReleaseBinPath('3.1.6'), ['/S']);
      expect(execSyncSpy).toHaveBeenNthCalledWith(1, 'net stop "Medplum Agent"');
      expect(execSyncSpy).toHaveBeenLastCalledWith('net start "Medplum Agent"');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to run installer, attempting to restart agent service...')
      );
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(console.log).not.toHaveBeenLastCalledWith(expect.stringContaining('Finished upgrade'));

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Specified version', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const fetchSpy = mockFetchForUpgrader('3.1.5');
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(
        jest.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(jest.fn());

      const receivedMsgPromise = new Promise<{ type: string }>((resolve) => {
        process.on('childSend', (msg) => {
          process.emit('disconnect');
          resolve(msg);
        });
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', '3.1.5'])).resolves.toBeUndefined();
      await expect(receivedMsgPromise).resolves.toEqual({ type: 'STARTED' });
      expect(existsSyncSpy).toHaveBeenNthCalledWith(1, resolve(__dirname, 'medplum-agent-installer-3.1.5.exe'));
      expect(getReleaseBinPath('3.1.5').endsWith('medplum-agent-installer-3.1.5.exe')).toEqual(true);
      expect(spawnSyncSpy).toHaveBeenLastCalledWith(getReleaseBinPath('3.1.5'), ['/S']);
      expect(execSyncSpy).toHaveBeenNthCalledWith(1, 'net stop "Medplum Agent"');
      expect(execSyncSpy).toHaveBeenLastCalledWith('net start "Medplum Agent"');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to run installer, attempting to restart agent service...')
      );
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(console.log).not.toHaveBeenLastCalledWith(expect.stringContaining('Finished upgrade'));

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Invalid version', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(
        jest.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(jest.fn());

      const receivedMsgPromise = new Promise<{ type: string }>((resolve) => {
        process.on('childSend', (msg) => {
          process.emit('disconnect');
          resolve(msg);
        });
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', 'INVALID'])).rejects.toThrow(
        'Invalid version specified'
      );
      await expect(receivedMsgPromise).resolves.toEqual({ type: 'STARTED' });

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Not in child process -- Missing process.send', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();
      const originalProcessSend = process.send;
      process.send = undefined;

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(
        jest.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(jest.fn());

      const receivedMsgPromise = new Promise<void>((resolve, reject) => {
        process.on('childSend', (msg) => {
          reject(new Error(`Expected not to receive message, got: ${JSON.stringify(msg)}`));
        });
        setTimeout(() => resolve(), 500);
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', 'INVALID'])).rejects.toThrow('process.exit');
      await expect(receivedMsgPromise).resolves.toBeUndefined();

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
      process.send = originalProcessSend;
    });
  });
});
