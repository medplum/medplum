import { MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { main } from '.';

vi.mock('fs');

let medplum: MedplumClient;

describe('CLI', () => {
  beforeEach(() => {
    medplum = new MockClient();
  });

  test('Missing command', async () => {
    console.log = vi.fn();
    await main(medplum, ['node', 'index.js']);
    expect(console.log).toBeCalledWith('Usage: medplum <command>');
  });

  test('Unknown command', async () => {
    console.log = vi.fn();
    await main(medplum, ['node', 'index.js', 'xyz']);
    expect(console.log).toBeCalledWith('Unknown command: xyz');
  });

  test('Deploy bot missing name', async () => {
    console.log = vi.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot']);
    expect(console.log).toBeCalledWith('Usage: medplum deploy-bot <bot-name>');
  });

  test('Deploy bot config not found', async () => {
    console.log = vi.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot', 'config-not-found']);
    expect(console.log).toBeCalledWith(expect.stringMatching('config-not-found not found'));
  });

  test('Deploy bot not found', async () => {
    console.log = vi.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot', 'does-not-exist']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Bot does not exist'));
  });

  test('Save bot success', async () => {
    console.log = vi.fn();
    const bot = await medplum.readResource('Bot', '123');
    await main(medplum, ['node', 'index.js', 'save-bot', 'hello-world']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.meta?.versionId).not.toEqual(bot.meta?.versionId);
  });

  test('Deploy bot success', async () => {
    console.log = vi.fn();
    const bot = await medplum.readResource('Bot', '123');
    await main(medplum, ['node', 'index.js', 'deploy-bot', 'hello-world']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.meta?.versionId).not.toEqual(bot.meta?.versionId);
  });
});
