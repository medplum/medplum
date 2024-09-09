import http from 'node:http';
import { shutdownApp } from './app';
import { main } from './index';

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

jest.mock('pg', () => {
  const original = jest.requireActual('pg');

  class MockPoolClient {
    async query(sql: string): Promise<any> {
      if (sql === 'SELECT "version" FROM "DatabaseMigration"') {
        return { rows: [{ version: 1000000 }] };
      }
      if (sql === 'SELECT "User"."id", "User"."content" FROM "User" WHERE "User"."deleted" = $1 LIMIT 2') {
        return { rows: [{ id: '1', content: '{}' }] };
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
