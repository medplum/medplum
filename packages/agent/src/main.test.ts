import { MEDPLUM_VERSION } from '@medplum/core';
import childProc from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import * as agentMainFile from './agent-main';
import { App } from './app';
import { main } from './main';
import * as pidFile from './pid';
import * as upgraderFile from './upgrader';

describe('Main', () => {
  beforeEach(() => {
    console.log = jest.fn();

    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    jest.spyOn(App.prototype, 'start').mockImplementation(() => Promise.resolve());

    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ access_token: 'foo' }));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Calling main no command flags', async () => {
    const agentMainSpy = jest.spyOn(agentMainFile, 'agentMain');
    const upgradeMainSpy = jest.spyOn(upgraderFile, 'upgraderMain');
    const createPidSpy = jest.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    const registerCleanupSpy = jest.spyOn(pidFile, 'registerAgentCleanup');
    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    // Invalid number of args
    await expect(main(['node', 'main.ts', 'https://example.com/', randomUUID()])).rejects.toThrow('process.exit');

    expect(createPidSpy).toHaveBeenCalledWith('medplum-agent');
    expect(registerCleanupSpy).toHaveBeenCalledWith();
    expect(upgradeMainSpy).not.toHaveBeenCalled();
    expect(agentMainSpy).toHaveBeenCalledWith(['node', 'main.ts', 'https://example.com/', expect.any(String)]);

    agentMainSpy.mockRestore();
    upgradeMainSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });

  test('Calling main with --upgrade', async () => {
    const platformSpy = jest.spyOn(os, 'platform').mockImplementation(() => 'linux');
    const agentMainSpy = jest.spyOn(agentMainFile, 'agentMain');
    const upgradeMainSpy = jest.spyOn(upgraderFile, 'upgraderMain');
    const createPidSpy = jest.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    const registerCleanupSpy = jest.spyOn(pidFile, 'registerAgentCleanup');

    await expect(main(['node', 'main.ts', '--upgrade'])).rejects.toThrow(
      'Unsupported platform: linux. Agent upgrader currently only supports Windows'
    );

    expect(createPidSpy).toHaveBeenCalledWith('medplum-agent-upgrader');
    expect(registerCleanupSpy).toHaveBeenCalledWith();
    expect(agentMainSpy).not.toHaveBeenCalled();
    expect(upgradeMainSpy).toHaveBeenCalledWith(['node', 'main.ts', '--upgrade']);

    platformSpy.mockRestore();
    agentMainSpy.mockRestore();
    upgradeMainSpy.mockRestore();
  });

  test('Calling main with --remove-old-services', async () => {
    const versions = ['123', '456', MEDPLUM_VERSION];

    const agentMainSpy = jest
      .spyOn(agentMainFile, 'agentMain')
      .mockImplementation((_argv: string[]) => Promise.resolve() as unknown as Promise<App>);
    const createPidSpy = jest.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    const registerCleanupSpy = jest.spyOn(pidFile, 'registerAgentCleanup');
    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const execSyncSpy = jest
      .spyOn(childProc, 'execSync')
      .mockReturnValue(
        `SERVICE_NAME: MedplumAgent_${versions[0]}\nSERVICE_NAME: MedplumAgent_${versions[1]}\nSERVICE_NAME: MedplumAgent_${versions[2]}\n`
      );
    const appendFileSyncSpy = jest.spyOn(fs, 'appendFileSync').mockImplementation();

    await expect(main(['node', 'main.ts', '--remove-old-services'])).resolves.toBeUndefined();

    expect(agentMainSpy).not.toHaveBeenCalled();
    expect(registerCleanupSpy).toHaveBeenCalled();

    expect(execSyncSpy).toHaveBeenCalledWith(`net stop MedplumAgent_${versions[0]}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`sc.exe delete MedplumAgent_${versions[0]}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`net stop MedplumAgent_${versions[1]}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`sc.exe delete MedplumAgent_${versions[1]}`);
    expect(execSyncSpy).not.toHaveBeenCalledWith(`net stop MedplumAgent_${MEDPLUM_VERSION}`);
    expect(execSyncSpy).not.toHaveBeenCalledWith(`sc.exe delete MedplumAgent_${MEDPLUM_VERSION}`);

    agentMainSpy.mockRestore();
    createPidSpy.mockRestore();
    existsSyncSpy.mockRestore();
    execSyncSpy.mockRestore();
    appendFileSyncSpy.mockRestore();
  });

  test('Calling main with --remove-old-services and --all', async () => {
    const versions = ['123', '456', MEDPLUM_VERSION];

    const agentMainSpy = jest
      .spyOn(agentMainFile, 'agentMain')
      .mockImplementation((_argv: string[]) => Promise.resolve() as unknown as Promise<App>);
    const createPidSpy = jest.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    const registerCleanupSpy = jest.spyOn(pidFile, 'registerAgentCleanup');
    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const execSyncSpy = jest
      .spyOn(childProc, 'execSync')
      .mockReturnValue(
        `SERVICE_NAME: MedplumAgent_${versions[0]}\nSERVICE_NAME: MedplumAgent_${versions[1]}\nSERVICE_NAME: MedplumAgent_${versions[2]}\n`
      );
    const appendFileSyncSpy = jest.spyOn(fs, 'appendFileSync').mockImplementation();

    await expect(main(['node', 'main.ts', '--remove-old-services', '--all'])).resolves.toBeUndefined();

    expect(agentMainSpy).not.toHaveBeenCalled();
    expect(registerCleanupSpy).toHaveBeenCalled();

    expect(execSyncSpy).toHaveBeenCalledWith(`net stop MedplumAgent_${versions[0]}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`sc.exe delete MedplumAgent_${versions[0]}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`net stop MedplumAgent_${versions[1]}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`sc.exe delete MedplumAgent_${versions[1]}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`net stop MedplumAgent_${MEDPLUM_VERSION}`);
    expect(execSyncSpy).toHaveBeenCalledWith(`sc.exe delete MedplumAgent_${MEDPLUM_VERSION}`);

    agentMainSpy.mockRestore();
    createPidSpy.mockRestore();
    existsSyncSpy.mockRestore();
    execSyncSpy.mockRestore();
    appendFileSyncSpy.mockRestore();
  });

  test('main creates "medplum-upgrading-agent" PID if upgrade manifest exists', async () => {
    const agentMainSpy = jest
      .spyOn(agentMainFile, 'agentMain')
      .mockImplementation((_argv: string[]) => Promise.resolve() as unknown as Promise<App>);
    const createPidSpy = jest.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    const registerCleanupSpy = jest.spyOn(pidFile, 'registerAgentCleanup');
    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    await expect(main(['node', 'main.ts', 'https://example.com/', 'foo'])).resolves.toBeUndefined();

    expect(createPidSpy).toHaveBeenCalledWith('medplum-upgrading-agent');
    expect(agentMainSpy).toHaveBeenCalledWith(['node', 'main.ts', 'https://example.com/', 'foo']);
    expect(registerCleanupSpy).toHaveBeenCalled();

    agentMainSpy.mockRestore();
    createPidSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });

  test('main creates "medplum-agent" PID if upgrade manifest does not exist', async () => {
    const agentMainSpy = jest
      .spyOn(agentMainFile, 'agentMain')
      .mockImplementation((_argv: string[]) => Promise.resolve() as unknown as Promise<App>);
    const createPidSpy = jest.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    const registerCleanupSpy = jest.spyOn(pidFile, 'registerAgentCleanup');
    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    await expect(main(['node', 'main.ts', 'https://example.com/', 'foo'])).resolves.toBeUndefined();

    expect(createPidSpy).toHaveBeenCalledWith('medplum-agent');
    expect(agentMainSpy).toHaveBeenCalledWith(['node', 'main.ts', 'https://example.com/', 'foo']);
    expect(registerCleanupSpy).toHaveBeenCalled();

    agentMainSpy.mockRestore();
    createPidSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });
});
