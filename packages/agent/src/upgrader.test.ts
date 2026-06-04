// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { clearReleaseCache } from '@medplum/core';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { upgraderMain } from './upgrader';
import { mockFetchForUpgrader } from './upgrader-test-utils';
import { getReleaseBinPath } from './upgrader-utils';


describe('Upgrader', () => {
  describe('Unsupported platforms', () => {
    test.each(['darwin', 'linux'])('platform() === %s -- should error', async (_platform) => {
      vi.mocked(platform).mockReturnValue(_platform as NodeJS.Platform);
      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).rejects.toThrow(
        `Unsupported platform: ${_platform}. Agent upgrader currently only supports Windows`
      );
    });
  });

  describe('Windows', () => {
    beforeEach(() => {
      vi.mocked(platform).mockReturnValue('win32');
      clearReleaseCache();
    });

    test.each([false, true])('Happy path -- installer downloaded: %s', async (installerDownloaded) => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => installerDownloaded);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(vi.fn());
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

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
      console.log = vi.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => false);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(
        vi.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

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
      console.log = vi.fn();

      const fetchSpy = mockFetchForUpgrader('4.2.4');
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => false);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(
        vi.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

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
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => false);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(
        vi.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

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
      console.log = vi.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => false);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(vi.fn());
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

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

    test('Download fails with 404 -- sends ERROR message and throws', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const manifest = {
        tag_name: 'v4.2.4',
        assets: [
          {
            name: 'medplum-agent-4.2.4-linux',
            browser_download_url: 'https://example.com/linux',
          },
          {
            name: 'medplum-agent-installer-4.2.4-windows.exe',
            browser_download_url: 'https://example.com/win32',
          },
        ],
      };

      let count = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        vi.fn(async () => {
          switch (count) {
            case 0:
              count++;
              return new Response(JSON.stringify(manifest), {
                headers: { 'content-type': 'application/json' },
                status: 200,
              });
            case 1:
              count++;
              return new Response(null, { status: 404, statusText: 'Not Found' });
            default:
              throw new Error('Too many calls');
          }
        })
      );
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => false);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(vi.fn());
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

      const receivedMsgPromise = new Promise<{ type: string; err?: string }>((resolve) => {
        process.once('childSend', (msg) => {
          resolve(msg);
        });
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).rejects.toThrow(
        'Failed to download installer with status code: 404'
      );
      await expect(receivedMsgPromise).resolves.toStrictEqual({
        type: 'ERROR',
        err: 'Failed to download installer with status code: 404',
      });

      // Installer should not have been run
      expect(spawnSyncSpy).not.toHaveBeenCalled();

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Invalid version via IPC -- sends ERROR message and throws', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => false);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(vi.fn());
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

      const receivedMsgPromise = new Promise<{ type: string; err?: string }>((resolve) => {
        process.once('childSend', (msg) => {
          resolve(msg);
        });
      });

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', 'INVALID'])).rejects.toThrow(
        'Invalid version specified'
      );
      await expect(receivedMsgPromise).resolves.toStrictEqual({
        type: 'ERROR',
        err: 'Invalid version specified',
      });

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Not in child process -- Missing process.send', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();
      const originalProcessSend = process.send;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });
      process.send = undefined;

      const fetchSpy = mockFetchForUpgrader();
      const existsSyncSpy = vi.mocked(existsSync).mockImplementation(() => false);
      const spawnSyncSpy = vi.mocked(spawnSync).mockImplementation(
        vi.fn(() => {
          throw new Error('Failed to stop the service');
        })
      );
      const execSyncSpy = vi.mocked(execSync).mockImplementation(vi.fn());

      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade', 'INVALID'])).rejects.toThrow('process.exit');

      for (const spy of [fetchSpy, existsSyncSpy, spawnSyncSpy, execSyncSpy]) {
        spy.mockReset();
      }
      console.log = originalConsoleLog;
      process.send = originalProcessSend;
      exitSpy.mockRestore();
    });
  });
});
