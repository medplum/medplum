import child_process from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { upgraderMain } from './upgrader';
import { ReleaseManifest, clearReleaseCache, getReleaseBinPath } from './upgrader-utils';

jest.mock('node:process', () => {
  return new (class MockProcess extends require('node:events') {
    send = jest.fn().mockImplementation((msg) => {
      this.emit('childSend', msg);
    });
    exit = jest.fn();
  })();
});

describe('Upgrader', () => {
  describe('Unsupported platforms', () => {
    test('Mac -- should error', async () => {
      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(() => 'darwin');
      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).rejects.toThrow(/Unsupported platform*/);
      platformSpy.mockRestore();
    });

    test('Linux -- should error', async () => {
      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(() => 'linux');
      await expect(upgraderMain(['node', 'upgrader.js', '--upgrade'])).rejects.toThrow(
        'Auto-upgrading is not currently supported for Linux'
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
  });
});

function mockFetchForUpgrader(): jest.SpyInstance {
  let count = 0;

  const manifest = {
    tag_name: 'v3.1.6',
    assets: [
      {
        name: 'medplum-agent-3.1.6-linux',
        browser_download_url: 'https://example.com/linux',
      },
      {
        name: 'medplum-agent-installer-3.1.6-windows.exe',
        browser_download_url: 'https://example.com/windows',
      },
    ],
  } satisfies ReleaseManifest;

  return jest.spyOn(globalThis, 'fetch').mockImplementation(
    jest.fn(async () => {
      return new Promise((resolve) => {
        switch (count) {
          case 0:
            count++;
            resolve(
              new Response(JSON.stringify(manifest), {
                headers: { 'content-type': 'application/json' },
                status: 200,
              })
            );
            break;
          case 1:
            count++;
            resolve(
              new Response(
                new ReadableStream({
                  start(controller) {
                    const textEncoder = new TextEncoder();
                    const chunks: Uint8Array[] = [
                      textEncoder.encode('Hello'),
                      textEncoder.encode(', '),
                      textEncoder.encode('Medplum!'),
                    ];

                    let streamIdx = 0;

                    // The following function handles each data chunk
                    function push(): void {
                      if (streamIdx === chunks.length) {
                        controller.close();
                        return;
                      }
                      controller.enqueue(chunks[streamIdx]);
                      streamIdx++;
                      push();
                    }

                    push();
                  },
                }),
                {
                  status: 200,
                  headers: { 'content-type': 'application/octet-stream' },
                }
              )
            );
            break;
          default:
            throw new Error('Too many calls');
        }
      });
    })
  );
}
