// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';
import { shutdownApp } from './app';
import { main } from './index';
import { GetDataVersionSql, GetVersionSql } from './migration-sql';
import { getLatestPostDeployMigrationVersion } from './migrations/migration-versions';

// This isn't really a mocked value, but it must be named that way to appease jest
// If we followed the same mocking pattern as `database.test.ts`, this wouldn't be necessary
const mockLatestVersion = getLatestPostDeployMigrationVersion();

jest.mock('express', () => {
  const original = jest.requireActual('express');
  const listen = jest.fn(() => ({}));
  const fn = (): any => {
    const app = original();
    app.listen = listen;
    return app;
  };
  fn.Router = original.Router;
  fn.json = original.json;
  fn.text = original.text;
  fn.urlencoded = original.urlencoded;
  fn.listen = listen;
  return fn;
});

// to appease jest, the name must start with "mock"
const mockQueries = {
  GetVersionSql,
  GetDataVersionSql,
};

jest.mock('pg', () => {
  const original = jest.requireActual('pg');

  class MockPoolClient {
    async query(sql: string): Promise<any> {
      if (sql === mockQueries.GetVersionSql) {
        return { rows: [{ version: 1000000 }] };
      }
      if (sql === mockQueries.GetDataVersionSql) {
        return { rows: [{ dataVersion: mockLatestVersion }] };
      }
      if (sql.startsWith('SELECT "User"."id"')) {
        return { rows: [{ id: '1', content: '{}' }] };
      }
      if (sql === 'SELECT pg_try_advisory_lock($1)') {
        return { rows: [{ pg_try_advisory_lock: true }] };
      }
      return { rows: [] };
    }

    release(): void {
      // Nothing to do
    }
  }

  class MockPool {
    async connect(): Promise<MockPoolClient> {
      return new MockPoolClient();
    }

    async query(sql: string): Promise<any> {
      return (await this.connect()).query(sql);
    }

    on(): void {
      // Nothing to do
    }

    end(): void {
      // Nothing to do
    }
  }

  return {
    ...original,
    Pool: MockPool,
  };
});

describe('Server', () => {
  test('Main', async () => {
    const createServerSpy = jest.spyOn(http, 'createServer');
    await main('file:test.config.json');
    expect(createServerSpy).toHaveBeenCalled();
    await shutdownApp();
  });
});

describe('entry point (child process)', () => {
  const packageDir = resolve(__dirname, '..');
  const tsxBin = resolve(packageDir, '../../node_modules/.bin/tsx');
  const harnessPath = resolve(packageDir, 'src/uncaught-exception-harness.ts');
  const indexPath = resolve(packageDir, 'src/index.ts');

  type ChildResult = {
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  };

  function runChild(args: string[], timeoutMs = 15000): Promise<ChildResult> {
    return new Promise((res, rej) => {
      const child = spawn(tsxBin, args, { cwd: packageDir });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      let timedOut = false;
      const t = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.on('exit', (code, signal) => {
        clearTimeout(t);
        res({ code, signal, stdout, stderr, timedOut });
      });
      child.on('error', rej);
    });
  }

  test('runs main when invoked as the entry module and drains stdout before exit(1) on startup error', async () => {
    const result = await runChild([indexPath, 'file:does-not-exist.config.json']);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    // The catch handler in the entry block must run, log, then drain before exiting.
    // If stdout were not drained, this final error line could be lost on exit.
    expect(result.stdout).toContain('Fatal error during startup');
  }, 30000);

  test('drains queued stdout output before exit(1) on uncaughtException', async () => {
    const floodCount = 5000;
    const result = await runChild([harnessPath, 'file:does-not-exist.config.json', 'kaboom', String(floodCount)]);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Uncaught exception thrown');
    // Every flooded line must be present in the captured output — if the listener
    // skipped drainStdout(), buffered writes would be truncated on process.exit.
    expect(result.stdout).toContain('flood-0\n');
    expect(result.stdout).toContain(`flood-${floodCount - 1}\n`);
  }, 30000);

  test('uncaughtException handler does not call process.exit(1) on "Connection terminated unexpectedly"', async () => {
    const result = await runChild([
      harnessPath,
      'file:does-not-exist.config.json',
      'Connection terminated unexpectedly',
      '0',
    ]);
    expect(result.timedOut).toBe(false);
    // The handler returned early without calling process.exit(1); with no remaining
    // event loop work the process exits naturally with code 0.
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Uncaught exception thrown');
  }, 30000);

  test('uncaughtException handler does not call process.exit(1) on "Unexpected end of input"', async () => {
    const result = await runChild([harnessPath, 'file:does-not-exist.config.json', 'Unexpected end of input', '0']);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Uncaught exception thrown');
  }, 30000);
});
