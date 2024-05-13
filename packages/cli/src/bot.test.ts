import { allOk } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import * as cli from '.';
import { createMedplumClient } from './util/client';

const { main } = cli;

jest.mock('./util/client');
jest.mock('node:fs', () => ({
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

describe('CLI Bots', () => {
  const env = process.env;
  let medplum: MockClient;
  let processError: jest.SpyInstance;

  beforeAll(() => {
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
    medplum = new MockClient();
    console.log = jest.fn();

    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    process.env = env;
  });

  test('Deploy bot missing name', async () => {
    await expect(main(['node', 'index.js', 'bot', 'deploy'])).rejects.toThrow('Process exited with exit code 1');
    expect(processError).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("error: missing required argument 'botName'")
    );
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
    await expect(main(['node', 'index.js', 'bot', 'deprecate', 'does-not-exist'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringContaining(`error: unknown command 'deprecate'`));
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

    await expect(main(['node', 'index.js', 'bot', 'deploy', 'hello-world'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringContaining('Error: Not found'));
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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeUndefined();
    expect(check.sourceCode).toBeDefined();
  });

  test('Deploy bot success', async () => {
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [allOk]);

    // Create the bot
    const bot = await medplum.createResource<Bot>({ id: randomUUID(), resourceType: 'Bot' });
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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeUndefined();
    expect(check.sourceCode).toBeDefined();
  });

  test('Deploy bot without dist success', async () => {
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [allOk]);

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
          },
        ],
      })
    );

    await main(['node', 'index.js', 'bot', 'deploy', 'hello-world']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeUndefined();
    expect(check.sourceCode).toBeDefined();
  });

  test('Deploy bot for multiple bot with wildcards ', async () => {
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [allOk]);

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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Success/));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Number of bots deployed: 2/));
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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deploy bot multiple bot ending with bot name with no config', async () => {
    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(undefined);

    await main(['node', 'index.js', 'bot', 'deploy', '*-staging']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Create bot command success with existing config file', async () => {
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [allOk]);

    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        bots: [],
      })
    );

    await main(['node', 'index.js', 'bot', 'create', 'test-bot', '1', 'src/hello-world.ts', 'dist/src/hello-world.ts']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Success! Bot created:'));
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).toHaveBeenCalled();
  });

  test('Create bot command success without existing config file', async () => {
    // No bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue('');

    await main(['node', 'index.js', 'bot', 'create', 'test-bot', '1', 'src/hello-world.ts', 'dist/src/hello-world.ts']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Success! Bot created:'));
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  test('Create bot command with auth options', async () => {
    // No bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue('');

    await main([
      'node',
      'index.js',
      'bot',
      'create',
      'test-bot',
      '1',
      'src/hello-world.ts',
      'dist/src/hello-world.ts',
      '--base-url',
      'http://localhost:8000',
      '--client-id',
      'test-client-id',
      '--client-secret',
      'test-client-secret',
    ]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Success! Bot created:'));
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  test('Create bot error with lack of commands', async () => {
    await expect(main(['node', 'index.js', 'bot', 'create', 'test-bot'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringContaining("error: missing required argument 'projectId'"));
  });

  test('Create bot do not write to config', async () => {
    // No bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue('');
    (fs.writeFileSync as unknown as jest.Mock).mockImplementation(() => {});

    await main([
      'node',
      'index.js',
      'bot',
      'create',
      'test-bot',
      '1',
      'src/hello-world.ts',
      'dist/src/hello-world.ts',
      '--no-write-config',
    ]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Success! Bot created:'));
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  // Deprecated bot commands

  test('Deprecate Deploy bot missing name', async () => {
    await expect(main(['node', 'index.js', 'deploy-bot'])).rejects.toThrow('Process exited with exit code 1');
    expect(processError).toHaveBeenCalledWith(expect.stringContaining(`error: missing required argument 'botName'`));
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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
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
    await expect(main(['node', 'index.js', 'deploy-bot', 'hello-world'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringMatching('Error: Not found'));
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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeUndefined();
    expect(check.sourceCode).toBeDefined();
  });

  test('Deprecate Deploy bot success', async () => {
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [allOk]);

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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Success/));
    const check = await medplum.readResource('Bot', bot.id as string);
    expect(check.code).toBeUndefined();
    expect(check.sourceCode).toBeDefined();
  });

  test('Deprecate Deploy bot for multiple bot with wildcards ', async () => {
    medplum.router.router.add('POST', 'Bot/:id/$deploy', async () => [allOk]);

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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Success/));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Number of bots deployed: 2/));
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

    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deprecate Deploy bot multiple bot ending with bot name with no config', async () => {
    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(undefined);

    await main(['node', 'index.js', 'deploy-bot', '*-staging']);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringMatching(/Success/));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deprecate Create bot command success', async () => {
    await main(['node', 'index.js', 'create-bot', 'test-bot', '1', 'src/hello-world.ts', 'dist/src/hello-world.ts']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Success! Bot created:'));
  });

  test('Deprecate Create bot error with lack of commands', async () => {
    await expect(main(['node', 'index.js', 'create-bot', 'test-bot'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringContaining("error: missing required argument 'projectId'"));
  });
});
