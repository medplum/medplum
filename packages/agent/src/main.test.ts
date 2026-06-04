// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION } from '@medplum/core';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, openSync } from 'node:fs';
import { platform } from 'node:os';
import * as agentMainFile from './agent-main';
import { App } from './app';
import { main } from './main';
import * as pidFile from './pid';
import * as upgraderFile from './upgrader';
import { UPGRADE_MANIFEST_PATH } from './upgrader-utils';

describe('Main', () => {
  beforeEach(() => {
    console.log = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(App.prototype, 'start').mockImplementation(() => Promise.resolve());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ access_token: 'foo' }));
    });
    vi.mocked(openSync).mockReturnValue(1);
    vi.mocked(closeSync).mockImplementation(() => undefined);
  });

  test('Calling main no command flags', async () => {
    const agentMainSpy = vi.spyOn(agentMainFile, 'agentMain');
    const upgradeMainSpy = vi.spyOn(upgraderFile, 'upgraderMain');
    const createPidSpy = vi.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    vi.spyOn(pidFile, 'registerAgentCleanup');
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(main(['node', 'main.ts', 'https://example.com/', randomUUID()])).rejects.toThrow('process.exit');

    expect(createPidSpy).toHaveBeenCalledWith('medplum-agent');
    expect(upgradeMainSpy).not.toHaveBeenCalled();
    expect(agentMainSpy).toHaveBeenCalled();
  });

  test('Calling main with --upgrade', async () => {
    vi.mocked(platform).mockReturnValue('linux');
    const agentMainSpy = vi.spyOn(agentMainFile, 'agentMain');
    const upgradeMainSpy = vi.spyOn(upgraderFile, 'upgraderMain');
    const createPidSpy = vi.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');

    await expect(main(['node', 'main.ts', '--upgrade'])).rejects.toThrow(
      'Unsupported platform: linux. Agent upgrader currently only supports Windows'
    );

    expect(createPidSpy).toHaveBeenCalledWith('medplum-agent-upgrader');
    expect(agentMainSpy).not.toHaveBeenCalled();
    expect(upgradeMainSpy).toHaveBeenCalled();
  });

  test('Calling main with --remove-old-services', async () => {
    const versions = ['123', '456', MEDPLUM_VERSION];
    vi.spyOn(agentMainFile, 'agentMain');
    vi.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    vi.spyOn(pidFile, 'registerAgentCleanup');
    vi.mocked(existsSync).mockReturnValue(true);
    const execSyncSpy = vi
      .mocked(execSync)
      .mockReturnValue(
        Buffer.from(
          `SERVICE_NAME: MedplumAgent_${versions[0]}\nSERVICE_NAME: MedplumAgent_${versions[1]}\nSERVICE_NAME: MedplumAgent_${versions[2]}\n`
        )
      );
    vi.mocked(appendFileSync).mockImplementation(() => undefined);

    await expect(main(['node', 'main.ts', '--remove-old-services'])).resolves.toBeUndefined();

    expect(execSyncSpy).toHaveBeenCalledWith(`net stop MedplumAgent_${versions[0]}`);
    expect(execSyncSpy).not.toHaveBeenCalledWith(`net stop MedplumAgent_${MEDPLUM_VERSION}`);
  });

  test('Calling main with --remove-old-services and --all', async () => {
    const versions = ['123', '456', MEDPLUM_VERSION];
    vi.spyOn(agentMainFile, 'agentMain');
    vi.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    vi.mocked(existsSync).mockReturnValue(true);
    const execSyncSpy = vi
      .mocked(execSync)
      .mockReturnValue(
        Buffer.from(
          `SERVICE_NAME: MedplumAgent_${versions[0]}\nSERVICE_NAME: MedplumAgent_${versions[1]}\nSERVICE_NAME: MedplumAgent_${versions[2]}\n`
        )
      );
    vi.mocked(appendFileSync).mockImplementation(() => undefined);

    await expect(main(['node', 'main.ts', '--remove-old-services', '--all'])).resolves.toBeUndefined();

    expect(execSyncSpy).toHaveBeenCalledWith(`net stop MedplumAgent_${MEDPLUM_VERSION}`);
  });

  test('main creates "medplum-upgrading-agent" PID if upgrade manifest exists', async () => {
    vi.spyOn(agentMainFile, 'agentMain').mockImplementation(() => Promise.resolve() as unknown as Promise<App>);
    const createPidSpy = vi.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    vi.mocked(existsSync).mockImplementation((path) => path === UPGRADE_MANIFEST_PATH);

    await expect(main(['node', 'main.ts', 'https://example.com/', 'foo'])).resolves.toBeUndefined();

    expect(createPidSpy).toHaveBeenCalledWith('medplum-upgrading-agent');
  });

  test('main creates "medplum-agent" PID if upgrade manifest does not exist', async () => {
    vi.spyOn(agentMainFile, 'agentMain').mockImplementation(() => Promise.resolve() as unknown as Promise<App>);
    const createPidSpy = vi.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(main(['node', 'main.ts', 'https://example.com/', 'foo'])).resolves.toBeUndefined();

    expect(createPidSpy).toHaveBeenCalledWith('medplum-agent');
  });
});
