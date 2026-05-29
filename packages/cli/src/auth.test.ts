// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { ContentType } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import cp from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { main } from '.';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';

vi.mock('node:child_process');
vi.mock('node:http');
vi.mock('./util/client');
vi.mock('node:fs', () => {
  const mock = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: vi.fn(async () => '{}'),
  },
};
  return { default: mock, ...mock };
});

describe('CLI auth', () => {
  const env = process.env;
  let medplum: MedplumClient;
  let processError: MockInstance;

  beforeAll(() => {
    process.exit = vi.fn().mockImplementation(function exit(exitCode: number) {
      if (exitCode === 0) {
        return;
      }
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...env };
    medplum = new MockClient();
    console.log = vi.fn();
    console.error = vi.fn();

    (createMedplumClient as unknown as Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    process.env = env;
  });

  test('Login success', async () => {
    (cp.exec as unknown as Mock).mockImplementation(
      (_, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        if (callback) {
          callback(null, '', '');
        }
        return true;
      }
    );
    (http.createServer as unknown as Mock).mockReturnValue({
      listen: () => ({
        close: () => undefined,
      }),
    });

    // Expect no active login to start
    expect(medplum.getActiveLogin()).toBeUndefined();

    // Start the login
    await main(['node', 'index.js', 'login']);

    // Get the handler
    const handler = (http.createServer as unknown as Mock).mock.calls[0][0];

    // Simulate a favicon.ico request, don't crash
    const req1 = { method: 'GET', url: '/favicon.ico' };
    const res1 = { writeHead: vi.fn(), end: vi.fn() };
    await handler(req1, res1);
    expect(res1.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': ContentType.TEXT });
    expect(res1.end).toHaveBeenCalledWith('Not found');

    // Simulate an OPTIONS request, don't process the code
    const req2 = { method: 'OPTIONS', url: '/?code=123' };
    const res2 = { writeHead: vi.fn(), end: vi.fn() };
    await handler(req2, res2);
    expect(res2.writeHead).toHaveBeenCalledWith(200, {
      Allow: 'GET, POST',
      'Content-Type': ContentType.TEXT,
    });
    expect(res2.end).toHaveBeenCalledWith('OK');

    // Simulate the redirect
    const req3 = { method: 'GET', url: '/?code=123' };
    const res3 = { writeHead: vi.fn(), end: vi.fn() };
    await handler(req3, res3);
    expect(res3.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': ContentType.TEXT });
    expect(res3.end).toHaveBeenCalledWith('Signed in as Alice Smith. You may close this window.');
    expect(medplum.getActiveLogin()).toBeDefined();
  });

  test('Login unsupported auth type', async () => {
    await expect(main(['node', 'index.js', 'login', '--auth-type', 'foo'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(
      expect.stringContaining(
        "error: option '--auth-type <authType>' argument 'foo' is invalid. Allowed choices are basic, client-credentials, authorization-code, jwt-bearer, token-exchange, jwt-assertion"
      )
    );
  });

  test('Login basic auth', async () => {
    expect(medplum.getActiveLogin()).toBeUndefined();
    await main(['node', 'index.js', 'login', '--auth-type', 'basic']);
    expect(processError).not.toHaveBeenCalled();
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
    expect(processError).not.toHaveBeenCalled();
  });

  test('Load credentials from disk', async () => {
    medplum = new MockClient({ storage: new FileSystemStorage('default') });

    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
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

    expect((console.log as unknown as Mock).mock.calls).toStrictEqual([
      ['Server:  https://example.com/'],
      ['Profile: Alice Smith (Practitioner/123)'],
      ['Project: My Project (Project/456)'],
    ]);
  });

  test('Get access token -- logged in', async () => {
    medplum = new MockClient({ storage: new FileSystemStorage('default') });

    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as Mock).mockReturnValue(
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

    await main(['node', 'index.js', 'token']);
    expect((console.log as unknown as Mock).mock.calls).toStrictEqual([[expect.any(String)]]);
  });

  test('Get access token -- needs auth (expired or not logged in)', async () => {
    medplum = new MockClient({ profile: null });
    await expect(main(['node', 'index.js', 'token'])).rejects.toThrow('Process exited with exit code 1');
    expect(processError).toHaveBeenLastCalledWith(expect.stringContaining('Error: Not logged in'));
  });
});
