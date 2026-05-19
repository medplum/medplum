// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import http from 'node:http';
import { shutdownApp } from './app';
import { main, runFromCli } from './index';
import * as loggerModule from './logger';
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
    const exitDrainSpy = jest.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();

    await handler(new Error('kaboom'), 'uncaughtException');

    expect(exitDrainSpy).toHaveBeenCalledTimes(1);
    expect(exitDrainSpy).toHaveBeenCalledWith();

    exitDrainSpy.mockRestore();
  });

  test('does not call process.exit(1) on "Connection terminated unexpectedly"', async () => {
    const exitDrainSpy = jest.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();

    await handler(new Error('Connection terminated unexpectedly'), 'uncaughtException');

    expect(exitDrainSpy).not.toHaveBeenCalled();

    exitDrainSpy.mockRestore();
  });

  test('does not call process.exit(1) on "Unexpected end of input"', async () => {
    const exitDrainSpy = jest.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();

    await handler(new Error('Unexpected end of input'), 'uncaughtException');

    expect(exitDrainSpy).not.toHaveBeenCalled();

    exitDrainSpy.mockRestore();
  });
});

describe('runFromCli', () => {
  test('logs and exits via exitAfterStdoutDrain on startup error', async () => {
    const exitDrainSpy = jest.spyOn(loggerModule, 'exitAfterStdoutDrain').mockResolvedValue();
    const errorSpy = jest.spyOn(loggerModule.globalLogger, 'error').mockImplementation(() => undefined);

    await runFromCli(['node', 'index.ts', 'file:does-not-exist.config.json']);

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toBe('Fatal error during startup');
    expect(exitDrainSpy).toHaveBeenCalledTimes(1);

    exitDrainSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
