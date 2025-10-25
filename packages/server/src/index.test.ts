// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import http from 'node:http';
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
