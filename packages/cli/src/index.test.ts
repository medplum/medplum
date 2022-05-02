import { MedplumClient } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';
import { main } from '.';

let medplum: MedplumClient;

describe('CLI', () => {
  beforeEach(() => {
    medplum = new MockClient();
  });

  test('Missing command', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js']);
    expect(console.log).toBeCalledWith('Usage: medplum <command>');
  });

  test('Unknown command', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'xyz']);
    expect(console.log).toBeCalledWith('Unknown command: xyz');
  });

  test('Deploy bot missing file name', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot']);
    expect(console.log).toBeCalledWith('Usage: medplum deploy-bot <bot-name> <bot-id>');
  });

  test('Deploy bot missing ID', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot', randomUUID(), '']);
    expect(console.log).toBeCalledWith('Error: Bot ID is not set');
  });

  test('Deploy bot file not found', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot', randomUUID(), randomUUID()]);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Bot file does not exist/));
  });

  test('Deploy bot not found', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot', 'dist/index.js', randomUUID()]);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Bot does not exist/));
  });

  test('Deploy bot success', async () => {
    console.log = jest.fn();
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    expect(bot.code).toBeUndefined();
    await main(medplum, ['node', 'index.js', 'deploy-bot', 'dist/index.js', bot.id as string]);
    const check = await medplum.readResource<Bot>('Bot', bot.id as string);
    expect(check.code).toBeDefined();
    expect(check.code).not.toEqual('');
  });
});
