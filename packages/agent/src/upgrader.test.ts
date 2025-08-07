// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { clearReleaseCache } from '@medplum/core';
import child_process from 'node:child_process';
import fs from 'node:fs';
import os, { platform } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { upgraderMain } from './upgrader';
import { mockFetchForUpgrader } from './upgrader-test-utils';
import { getReleaseBinPath } from './upgrader-utils';

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
      await expect(receivedMsgPromise).resolves.toStrictEqual({ type: 'STARTED' });
      expect(existsSyncSpy).toHaveBeenNthCalledWith(1, resolve(__dirname, 'medplum-agent-installer-4.2.4.exe'));
      expect(getReleaseBinPath('4.2.4').endsWith('medplum-agent-installer-4.2.4.exe')).toStrictEqual(true);
      expect(spawnSyncSpy).toHaveBeenLastCalledWith(`"${getReleaseBinPath('4.2.4')}" /S`, {
        shell: true,
        windowsHide: true,
      });
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Finished upgrade'));

      expect(fetchSpy).toHaveBeenCalledTimes(installerDownloaded ? 1 : 2);

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
      await expect(receivedMsgPromise).resolves.toStrictEqual({ type: 'STARTED' });
      expect(existsSyncSpy).toHaveBeenNthCalledWith(1, resolve(__dirname, 'medplum-agent-installer-4.2.4.exe'));
      expect(getReleaseBinPath('4.2.4').endsWith('medplum-agent-installer-4.2.4.exe')).toStrictEqual(true);
      expect(spawnSyncSpy).toHaveBeenLastCalledWith(`"${getReleaseBinPath('4.2.4')}" /S`, {
        shell: true,
        windowsHide: true,
      });
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

      const fetchSpy = mockFetchForUpgrader('4.2.4');
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

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', '4.2.4'])).resolves.toBeUndefined();
      await expect(receivedMsgPromise).resolves.toStrictEqual({ type: 'STARTED' });
      expect(existsSyncSpy).toHaveBeenNthCalledWith(1, resolve(__dirname, 'medplum-agent-installer-4.2.4.exe'));
      expect(getReleaseBinPath('4.2.4').endsWith('medplum-agent-installer-4.2.4.exe')).toStrictEqual(true);
      expect(spawnSyncSpy).toHaveBeenLastCalledWith(`"${getReleaseBinPath('4.2.4')}" /S`, {
        shell: true,
        windowsHide: true,
      });
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

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(
        jest.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(jest.fn());

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', 'INVALID'])).rejects.toThrow(
        'Invalid version specified'
      );

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Pre-4.2.4', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
      const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockImplementation(jest.fn());
      const execSyncSpy = jest.spyOn(child_process, 'execSync').mockImplementation(jest.fn());

      // Try to use a pre-4.2.4 version
      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', '3.1.6'])).resolves.toBeUndefined();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Uninstalling the current agent service before installing the pre-zero-downtime agent...'
        )
      );
      expect(spawnSyncSpy).toHaveBeenCalledWith(resolve(__dirname, 'upgrader.ts'), ['--remove-old-services', '--all']);

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

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', 'INVALID'])).rejects.toThrow('process.exit');

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
      process.send = originalProcessSend;
    });
  });
});
