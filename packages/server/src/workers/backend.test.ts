// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';
import type { ServerConfig } from '../config/utils';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
  migrate: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: class {
    query = mocks.query;
    connect = mocks.connect;
    end = mocks.end;
    setMaxListeners = vi.fn();
    on = vi.fn();
  },
}));
vi.mock('bullmq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('bullmq')>()),
  runMigrations: mocks.migrate,
}));

import { closeQueueBackend, getQueueBackendOptions, initQueueBackend, testQueueBackend } from './backend';

const postgres = {
  backgroundJobs: {
    backend: 'postgres',
    postgres: { connectionString: 'postgres://localhost/jobs', maxConnections: 4 },
  },
} as ServerConfig;

describe('queue backend lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ release: mocks.release });
    mocks.migrate.mockResolvedValue(undefined);
    mocks.end.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue({ rows: [{ status: 1 }] });
  });

  afterEach(async () => closeQueueBackend());

  test('uses Redis by default, including its dedicated background-jobs connection', async () => {
    const config = { redis: { host: 'general' }, backgroundJobsRedis: { host: 'jobs' } } as ServerConfig;
    await initQueueBackend(config);
    expect(getQueueBackendOptions(config)).toMatchObject({ host: 'jobs' });
    expect(await testQueueBackend()).toBeUndefined();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  test('migrates before exposing the pool, reports health and closes it', async () => {
    expect(() => getQueueBackendOptions(postgres)).toThrow('not initialized');
    await initQueueBackend(postgres, 2);
    expect(mocks.migrate).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(await testQueueBackend()).toBe(true);
    mocks.query.mockRejectedValueOnce(new Error('database unavailable'));
    expect(await testQueueBackend()).toBe(false);
    await closeQueueBackend();
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(await testQueueBackend()).toBeUndefined();
  });

  test('closes the pool and releases the client when migration fails', async () => {
    mocks.migrate.mockRejectedValueOnce(new Error('migration failed'));
    await expect(initQueueBackend(postgres, 2)).rejects.toThrow('migration failed');
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(() => getQueueBackendOptions(postgres)).toThrow('not initialized');
  });

  test('rejects a pool too small for the enabled workers', async () => {
    await expect(initQueueBackend(postgres, 4)).rejects.toThrow('maxConnections');
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  test('does not include credentials in malformed connection errors', async () => {
    const config = {
      backgroundJobs: { backend: 'postgres', postgres: { connectionString: 'postgres://user:secret@[' } },
    } as ServerConfig;
    const error = await initQueueBackend(config, 1).then(() => undefined, (err: Error) => err);
    if (!(error instanceof Error)) {
      throw new Error('Expected an invalid URL error');
    }
    expect(error.message).toBe('backgroundJobs.postgres.connectionString must be a PostgreSQL URL');
    expect(error.message).not.toContain('secret');
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  test.each([
    ['https://localhost/jobs', 'PostgreSQL URL'],
    ['postgres://localhost/jobs?options=-c%20search_path%3Dpublic', 'must not set options'],
  ])('rejects unsupported PostgreSQL connection URL %s', async (connectionString, message) => {
    const config = { backgroundJobs: { backend: 'postgres', postgres: { connectionString } } } as ServerConfig;
    await expect(initQueueBackend(config, 1)).rejects.toThrow(message);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
