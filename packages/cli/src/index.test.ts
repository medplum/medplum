import { createReference, MedplumClient } from '@medplum/core';
import { Bot, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import cp from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import http from 'http';
import { main, run } from '.';
import { FileSystemStorage } from './storage';

jest.mock('child_process');
jest.mock('http');

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

let medplum: MedplumClient;

describe('CLI', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
    medplum = new MockClient();
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn<never, any, any>();
  });

  afterEach(() => {
    process.env = env;
  });

  test('run', () => {
    run();
    expect(process.exit).toBeCalledWith(1);
  });

  test('run with optional env set', () => {
    process.env.MEDPLUM_BASE_URL = 'http://example.com';
    process.env.MEDPLUM_FHIR_URL_PATH = '/fhir/test/path/';
    process.env.MEDPLUM_CLIENT_ACCESS_TOKEN = 'test_token';
    run();
    expect(process.exit).toBeCalledWith(1);
  });

  test('Missing command', async () => {
    await main(medplum, ['node', 'index.js']);
    expect(process.exit).toHaveBeenCalledWith(1);
    // default command help displays
    expect(processError).toBeCalledWith(expect.stringContaining('Usage: medplum [options] [command]'));
    expect(processError).toBeCalledWith(expect.stringContaining('Command to access Medplum CLI'));
  });

  test('Unknown command', async () => {
    await main(medplum, ['node', 'index.js', 'xyz']);
    expect(processError).toBeCalledWith(expect.stringContaining(`error: unknown command 'xyz'`));
  });

  test('Client ID and secret login', async () => {
    process.env.MEDPLUM_CLIENT_ID = '123';
    process.env.MEDPLUM_CLIENT_SECRET = 'abc';
    await main(medplum, ['node', 'index.js', 'whoami']);
    expect(medplum.getActiveLogin()).toBeDefined();
  });

  test('Login success', async () => {
    (cp.exec as unknown as jest.Mock).mockReturnValue(true);
    (http.createServer as unknown as jest.Mock).mockReturnValue({
      listen: () => ({
        close: () => undefined,
      }),
    });

    // Expect no active login to start
    expect(medplum.getActiveLogin()).toBeUndefined();

    // Start the login
    await main(medplum, ['node', 'index.js', 'login']);

    // Get the handler
    const handler = (http.createServer as unknown as jest.Mock).mock.calls[0][0];

    // Simulate a favicon.ico request, don't crash
    const req1 = { url: '/favicon.ico' };
    const res1 = { writeHead: jest.fn(), end: jest.fn() };
    await handler(req1, res1);
    expect(res1.writeHead).toBeCalledWith(404, { 'Content-Type': 'text/plain' });
    expect(res1.end).toBeCalledWith('Not found');

    // Simulate the redirect
    const req2 = { url: '/?code=123' };
    const res2 = { writeHead: jest.fn(), end: jest.fn() };
    await handler(req2, res2);
    expect(res2.writeHead).toBeCalledWith(200, { 'Content-Type': 'text/plain' });
    expect(res2.end).toBeCalledWith('Signed in as Alice Smith. You may close this window.');
    expect(medplum.getActiveLogin()).toBeDefined();
  });

  test('Load credentials from disk', async () => {
    medplum = new MockClient({ storage: new FileSystemStorage() });

    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        activeLogin: JSON.stringify({
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/123',
            display: 'Alice Smith',
          },
          project: {
            reference: 'Project/456',
            display: 'My Project',
          },
        }),
      })
    );

    await main(medplum, ['node', 'index.js', 'whoami']);

    expect((console.log as unknown as jest.Mock).mock.calls).toEqual([
      ['Server:  https://example.com/'],
      ['Profile: Alice Smith (Practitioner/123)'],
      ['Project: My Project (Project/456)'],
    ]);
  });

  test('Delete command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(medplum, ['node', 'index.js', 'delete', `Patient/${patient.id}`]);
    expect(console.log).toBeCalledWith(expect.stringMatching('OK'));
    try {
      await medplum.readReference(createReference(patient));
      throw new Error('Expected error');
    } catch (err) {
      expect((err as Error).message).toBe('Not found');
    }
  });

  test('Get command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(medplum, ['node', 'index.js', 'get', `Patient/${patient.id}`]);

    expect(console.log).toBeCalledWith(expect.stringMatching(patient.id as string));
  });

  test('Get not found', async () => {
    await main(medplum, ['node', 'index.js', 'get', `Patient/${randomUUID()}`]);
    expect(console.error).toBeCalledWith(expect.stringMatching('Error: Not found'));
  });

  test('Get admin urls', async () => {
    await main(medplum, ['node', 'index.js', 'get', 'admin/projects/123']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Project 123'));
  });

  test('Get command with as-transaction flag', async () => {
    await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(medplum, ['node', 'index.js', 'get', '--as-transaction', `Patient?_count=2`]);
    expect(console.log).toBeCalledWith(expect.stringMatching('urn:uuid'));
  });

  test('Get command with invalid flag', async () => {
    await medplum.createResource<Patient>({ resourceType: 'Patient' });

    await main(medplum, ['node', 'index.js', 'get', '--bad-flag', `Patient?_count=2`]);
    expect(processError).toBeCalledWith(expect.stringContaining(`error: unknown option '--bad-flag'`));
  });

  test('Post command', async () => {
    await main(medplum, ['node', 'index.js', 'post', 'Patient', '{ "resourceType": "Patient" }']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Patient'));
  });

  test('Put command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(medplum, [
      'node',
      'index.js',
      'put',
      `Patient/${patient.id}`,
      JSON.stringify({ ...patient, gender: 'male' }),
    ]);
    expect(console.log).toBeCalledWith(expect.stringMatching('male'));
  });

  test('Patch command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(medplum, [
      'node',
      'index.js',
      'patch',
      `Patient/${patient.id}`,
      '[{"op":"add","path":"/active","value":[true]}]',
    ]);
    expect(console.log).toBeCalledWith(expect.stringMatching('active'));
  });

  //Bots

  test('Deploy bot missing name', async () => {
    await main(medplum, ['node', 'index.js', 'bot', 'deploy']);
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
    await main(medplum, ['node', 'index.js', 'bot', 'deprecate', 'does-not-exist']);
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

    await main(medplum, ['node', 'index.js', 'bot', 'deploy', 'hello-world']);
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

    await main(medplum, ['node', 'index.js', 'bot', 'save', 'hello-world']);
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

    await main(medplum, ['node', 'index.js', 'bot', 'deploy', 'hello-world']);
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

    await main(medplum, ['node', 'index.js', 'bot', 'deploy', 'he**llo*']);
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

    await main(medplum, ['node', 'index.js', 'bot', 'deploy', '*-staging']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deploy bot multiple bot ending with bot name with no config', async () => {
    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(undefined);

    await main(medplum, ['node', 'index.js', 'bot', 'deploy', '*-staging']);
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Create bot command success', async () => {
    await main(medplum, [
      'node',
      'index.js',
      'bot',
      'create',
      'test-bot',
      '1',
      'src/hello-world.ts',
      'dist/src/hello-world.ts',
    ]);
    expect(console.log).toBeCalledWith(expect.stringMatching('Success! Bot created:'));
  });

  test('Create bot error with lack of commands', async () => {
    await main(medplum, ['node', 'index.js', 'bot', 'create', 'test-bot']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Error while creating new bot'));
  });

  // Deprecated bot commands

  test('Deprecate Deploy bot missing name', async () => {
    await main(medplum, ['node', 'index.js', 'deploy-bot']);
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

    await main(medplum, ['node', 'index.js', 'deploy-bot', 'does-not-exist']);
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
    await main(medplum, ['node', 'index.js', 'deploy-bot', 'hello-world']);
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

    await main(medplum, ['node', 'index.js', 'save-bot', 'hello-world']);
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

    await main(medplum, ['node', 'index.js', 'deploy-bot', 'hello-world']);
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

    await main(medplum, ['node', 'index.js', 'deploy-bot', 'he**llo*']);
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

    await main(medplum, ['node', 'index.js', 'deploy-bot', '*-staging']);

    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deprecate Deploy bot multiple bot ending with bot name with no config', async () => {
    // Setup bot config
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(undefined);

    await main(medplum, ['node', 'index.js', 'deploy-bot', '*-staging']);
    expect(console.log).not.toBeCalledWith(expect.stringMatching(/Success/));
    expect(console.log).toBeCalledWith(expect.stringMatching(/Number of bots deployed: 0/));
  });

  test('Deprecate Create bot command success', async () => {
    await main(medplum, [
      'node',
      'index.js',
      'create-bot',
      'test-bot',
      '1',
      'src/hello-world.ts',
      'dist/src/hello-world.ts',
    ]);
    expect(console.log).toBeCalledWith(expect.stringMatching('Success! Bot created:'));
  });

  test('Depreate Create bot error with lack of commands', async () => {
    await main(medplum, ['node', 'index.js', 'create-bot', 'test-bot']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Error while creating new bot'));
  });
});
