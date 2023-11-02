import { ContentType, MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import cp from 'child_process';
import fs from 'fs';
import http from 'http';
import { main } from '.';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';

jest.mock('child_process');
jest.mock('http');
jest.mock('./util/client');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

describe('CLI auth', () => {
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
    await main(['node', 'index.js', 'login']);

    // Get the handler
    const handler = (http.createServer as unknown as jest.Mock).mock.calls[0][0];

    // Simulate a favicon.ico request, don't crash
    const req1 = { url: '/favicon.ico' };
    const res1 = { writeHead: jest.fn(), end: jest.fn() };
    await handler(req1, res1);
    expect(res1.writeHead).toBeCalledWith(404, { 'Content-Type': ContentType.TEXT });
    expect(res1.end).toBeCalledWith('Not found');

    // Simulate the redirect
    const req2 = { url: '/?code=123' };
    const res2 = { writeHead: jest.fn(), end: jest.fn() };
    await handler(req2, res2);
    expect(res2.writeHead).toBeCalledWith(200, { 'Content-Type': ContentType.TEXT });
    expect(res2.end).toBeCalledWith('Signed in as Alice Smith. You may close this window.');
    expect(medplum.getActiveLogin()).toBeDefined();
  });

  test('Login unsupported auth type', async () => {
    await main(['node', 'index.js', 'login', '--auth-type', 'foo']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error: Allowed choices are'));
  });

  test('Login basic auth', async () => {
    expect(medplum.getActiveLogin()).toBeUndefined();
    await main(['node', 'index.js', 'login', '--auth-type', 'basic']);
    expect(console.log).toHaveBeenCalledWith('Login successful');
  });

  test('Login client credentials', async () => {
    expect(medplum.getActiveLogin()).toBeUndefined();
    await main([
      'node',
      'index.js',
      'login',
      '--auth-type',
      'client-credentials',
      '--client-id',
      '123',
      '--client-secret',
      'abc',
    ]);
    expect(console.log).toHaveBeenCalledWith('Login successful');
  });

  test('Load credentials from disk', async () => {
    medplum = new MockClient({ storage: new FileSystemStorage('default') });

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

    await main(['node', 'index.js', 'whoami']);

    expect((console.log as unknown as jest.Mock).mock.calls).toEqual([
      ['Server:  https://example.com/'],
      ['Profile: Alice Smith (Practitioner/123)'],
      ['Project: My Project (Project/456)'],
    ]);
  });
});
