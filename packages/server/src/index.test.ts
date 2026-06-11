// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import http from 'node:http';
import { shutdownApp } from './app';
import { main, runFromCli } from './index';
import * as loggerModule from './logger';
import { GetDataVersionSql, GetVersionSql } from './migration-sql';
import { getLatestPostDeployMigrationVersion } from './migrations/migration-versions';
import { vi } from 'vitest';

// This isn't really a mocked value, but it must be named that way to appease jest
// If we followed the same mocking pattern as `database.test.ts`, this wouldn't be necessary
const mockLatestVersion = getLatestPostDeployMigrationVersion();

vi.mock('express', async (importOriginal) => {
  const original = await importOriginal<typeof import('express')>();
  const express = original.default ?? original;
  const listen = vi.fn(() => ({}));
  const fn = (): any => {
    const app = express();
    app.listen = listen;
    return app;
  };
  return {
    ...original,
    default: fn,
    Router: original.Router,
    json: original.json,
    text: original.text,
    urlencoded: original.urlencoded,
  };
});

// to appease jest, the name must start with "mock"
const mockQueries = {
  GetVersionSql,
  GetDataVersionSql,
};

vi.mock('pg', async () => {
  const original = await vi.importActual<typeof import('pg')>('pg');

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
    const createServerSpy = vi.spyOn(http, 'createServer');
    await main('file:test.config.json');
    expect(createServerSpy).toHaveBeenCalled();
    await shutdownApp();
  });
});

describe('uncaughtException handler', () => {
  let handler: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => Promise<void>;
  let baselineUncaught: NodeJS.UncaughtExceptionListener[];
  let baselineRejection: NodeJS.UnhandledRejectionListener[];

  beforeAll(async () => {
    baselineUncaught = process.listeners('uncaughtException');
    baselineRejection = process.listeners('unhandledRejection');
    await main('file:test.config.json');
    const installed = process.listeners('uncaughtException').filter((l) => !baselineUncaught.includes(l));
    expect(installed).toHaveLength(1);
    handler = installed[0] as (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => Promise<void>;
  });

  afterAll(async () => {
    process
      .listeners('uncaughtException')
      .filter((l) => !baselineUncaught.includes(l))
      .forEach((l) => process.off('uncaughtException', l));
    process
      .listeners('unhandledRejection')
      .filter((l) => !baselineRejection.includes(l))
      .forEach((l) => process.off('unhandledRejection', l));
    await shutdownApp();
  });

  test('drains stdout before calling process.exit(1)', async () => {
    const exitDrainSpy = vi.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();

    await handler(new Error('kaboom'), 'uncaughtException');

    expect(exitDrainSpy).toHaveBeenCalledTimes(1);
    expect(exitDrainSpy).toHaveBeenCalledWith();

    exitDrainSpy.mockRestore();
  });

  test('does not call process.exit(1) on "Connection terminated unexpectedly"', async () => {
    const exitDrainSpy = vi.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();

    await handler(new Error('Connection terminated unexpectedly'), 'uncaughtException');

    expect(exitDrainSpy).not.toHaveBeenCalled();

    exitDrainSpy.mockRestore();
  });

  test('does not call process.exit(1) on "Unexpected end of input"', async () => {
    const exitDrainSpy = vi.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();

    await handler(new Error('Unexpected end of input'), 'uncaughtException');

    expect(exitDrainSpy).not.toHaveBeenCalled();

    exitDrainSpy.mockRestore();
  });
});

describe('runFromCli', () => {
  test('logs and exits via exitAfterStdoutDrain on startup error', async () => {
    const exitDrainSpy = vi.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();
    const errorSpy = vi.spyOn(loggerModule.globalLogger, 'error').mockImplementation(() => undefined);

    await runFromCli(['node', 'index.ts', 'file:does-not-exist.config.json']);

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toBe('Fatal error during startup');
    expect(exitDrainSpy).toHaveBeenCalledTimes(1);

    exitDrainSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
