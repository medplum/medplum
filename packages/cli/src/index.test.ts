import { MedplumClient } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import cp from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import http from 'http';
import { main } from '.';

jest.mock('child_process');
jest.mock('fs');
jest.mock('http');

let medplum: MedplumClient;

describe('CLI', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
    medplum = new MockClient();
  });

  afterEach(() => {
    process.env = env;
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

    // Simulate the redirect
    const handler = (http.createServer as unknown as jest.Mock).mock.calls[0][0];
    const req = { url: '/?code=123' };
    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    };
    await handler(req, res);
    expect(res.writeHead).toBeCalledWith(200, { 'Content-Type': 'text/plain' });
    expect(res.end).toBeCalledWith('Signed in as Alice Smith. You may close this window.');
    expect(medplum.getActiveLogin()).toBeDefined();
  });

  test('Load credentials from disk', async () => {
    console.log = jest.fn();

    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
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
      })
    );

    await main(medplum, ['node', 'index.js', 'whoami']);

    expect((console.log as unknown as jest.Mock).mock.calls).toEqual([
      ['Profile: Alice Smith (Practitioner/123)'],
      ['Project: My Project (Project/456)'],
    ]);
  });

  test('Deploy bot missing name', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'deploy-bot']);
    expect(console.log).toBeCalledWith('Usage: medplum deploy-bot <bot-name>');
  });

  test('Deploy bot config not found', async () => {
    console.log = jest.fn();
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
    expect(console.log).toBeCalledWith(expect.stringMatching('does-not-exist not found'));
  });

  test('Deploy bot not found', async () => {
    console.log = jest.fn();
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
    expect(console.log).toBeCalledWith(expect.stringMatching('Not found'));
  });

  test('Save bot success', async () => {
    console.log = jest.fn();

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

  test('Deploy bot success', async () => {
    console.log = jest.fn();

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
});
