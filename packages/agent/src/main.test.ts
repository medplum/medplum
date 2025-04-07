import { randomUUID } from 'node:crypto';
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

  test('Calling main without --upgrade', async () => {
    const agentMainSpy = jest.spyOn(agentMainFile, 'agentMain');
    const upgradeMainSpy = jest.spyOn(upgraderFile, 'upgraderMain');
    const createPidSpy = jest.spyOn(pidFile, 'createPidFile').mockReturnValue('/tmp/test.pid');
    const registerCleanupSpy = jest.spyOn(pidFile, 'registerAgentCleanup');

    // Invalid number of args
    await expect(main(['node', 'main.ts', 'https://example.com/', randomUUID()])).rejects.toThrow('process.exit');

    expect(createPidSpy).toHaveBeenCalledWith('medplum-agent');
    expect(registerCleanupSpy).toHaveBeenCalledWith();
    expect(upgradeMainSpy).not.toHaveBeenCalled();
    expect(agentMainSpy).toHaveBeenCalledWith(['node', 'main.ts', 'https://example.com/', expect.any(String)]);

    agentMainSpy.mockRestore();
    upgradeMainSpy.mockRestore();
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
});
