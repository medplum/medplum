import { MedplumClient } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { main } from '.';
import { createMedplumClient } from './util/client';

jest.mock('./util/client');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));
const processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());

describe('CLI Bots', () => {
  const env = process.env;
  let medplum: MedplumClient;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
    medplum = new MockClient();
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn<never, any>();
    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    process.env = env;
  });

  test('Deploy bot missing name', async () => {
    await main(['node', 'index.js', 'bot', 'deploy']);
    expect(processError).toBeCalledWith(expect.stringContaining(`error: missing required argument 'botName'`));
  });

  test('Deploy bot config not found', async () => {
    const id = randomUUID();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );
    await main(['node', 'index.js', 'bot', 'deprecate', 'does-not-exist']);
    expect(processError).toBeCalledWith(expect.stringContaining(`error: unknown command 'deprecate'`));
  });

  test('Deploy bot not found', async () => {
    const id = randomUUID();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'bot', 'deploy', 'hello-world']);
    expect(console.error).toBeCalledWith(expect.stringContaining('Error: Not found'));
  });

  test('Save bot success', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    expect(bot.code).toBeUndefined();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'bot', 'save', 'hello-world']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeDefined();
    expect(check.code).not.toEqual('');
  });

  test('Deploy bot success', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    expect(bot.code).toBeUndefined();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'bot', 'deploy', 'hello-world']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeDefined();
    expect(check.code).not.toEqual('');
  });

  test('Deploy bot for multiple bot with wildcards ', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    const bot2 = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world-staging',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
          {
            name: 'hello-world-2-staging',
            id: bot2.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'bot', 'deploy', 'he**llo*']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 2/));
  });

  test('Deploy bot multiple bot ending with bot name that has no match', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    const bot2 = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
          {
            name: 'hello-world-2',
            id: bot2.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'bot', 'deploy', '*-staging']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deploy bot multiple bot ending with bot name with no config', async () => {
    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(undefined);

    await main(['node', 'index.js', 'bot', 'deploy', '*-staging']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Create bot command success', async () => {
    await main(['node', 'index.js', 'bot', 'create', 'test-bot', '1', 'src/hello-world.ts', 'dist/src/hello-world.ts']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Success! Bot created:'));
  });

  test('Create bot error with lack of commands', async () => {
    await main(['node', 'index.js', 'bot', 'create', 'test-bot']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Error while creating new bot'));
  });

  // Deprecated bot commands

  test('Deprecate Deploy bot missing name', async () => {
    await main(['node', 'index.js', 'deploy-bot']);
    expect(processError).toBeCalledWith(expect.stringContaining(`error: missing required argument 'botName'`));
  });

  test('Deprecate Deploy bot config not found', async () => {
    const id = randomUUID();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'deploy-bot', 'does-not-exist']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deprecate Deploy bot not found', async () => {
    const id = randomUUID();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );
    await main(['node', 'index.js', 'deploy-bot', 'hello-world']);
    expect(console.error).toBeCalledWith(expect.stringMatching('Error: Not found'));
  });

  test('Deprecate Save bot success', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    expect(bot.code).toBeUndefined();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'save-bot', 'hello-world']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeDefined();
    expect(check.code).not.toEqual('');
  });

  test('Deprecate Deploy bot success', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    expect(bot.code).toBeUndefined();

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'deploy-bot', 'hello-world']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeDefined();
    expect(check.code).not.toEqual('');
  });

  test('Deprecate Deploy bot for multiple bot with wildcards ', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    const bot2 = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world-staging',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
          {
            name: 'hello-world-2-staging',
            id: bot2.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'deploy-bot', 'he**llo*']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Success/));
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 2/));
  });

  test('Deprecate Deploy bot multiple bot ending with bot name that has no match', async () => {
    // Create the bot
    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
    const bot2 = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [
          {
            name: 'hello-world',
            id: bot.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
          {
            name: 'hello-world-2',
            id: bot2.id,
            source: 'src/hello-world.ts',
            dist: 'dist/hello-world.js',
          },
        ],
      })
    );

    await main(['node', 'index.js', 'deploy-bot', '*-staging']);

    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deprecate Deploy bot multiple bot ending with bot name with no config', async () => {
    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(undefined);

    await main(['node', 'index.js', 'deploy-bot', '*-staging']);
    expect(console.log).not.toBeCalledWith(expect.stringMatching(/Success/));
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deprecate Create bot command success', async () => {
    await main(['node', 'index.js', 'create-bot', 'test-bot', '1', 'src/hello-world.ts', 'dist/src/hello-world.ts']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Success! Bot created:'));
  });

  test('Depreate Create bot error with lack of commands', async () => {
    await main(['node', 'index.js', 'create-bot', 'test-bot']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Error while creating new bot'));
  });
});
