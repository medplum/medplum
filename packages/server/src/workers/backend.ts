// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  BackendFactory,
  ConnectionOptions,
  IQueueBackend,
  PostgresConnectionOptions,
  Queue as BullQueue,
  Worker as BullWorker,
} from 'bullmq';
import { createPostgresBackend, createRedisBackend, runMigrations, withBackend } from 'bullmq';
import { Pool } from 'pg';
import type { ServerConfig } from '../config/utils';
import { globalLogger } from '../logger';
import { reconnectOnError } from '../redis';

export type QueueConnection = ConnectionOptions | PostgresConnectionOptions;
export type Queue<T = any> = BullQueue<T, any, string, T, any, string, IQueueBackend, QueueConnection>;
export type Worker<T = any> = BullWorker<T, any, string, IQueueBackend, any, QueueConnection>;

// Select a factory per instance; never alter BullMQ's process-wide default.
const backendFactory: BackendFactory<IQueueBackend, QueueConnection> = (name, opts, factoryOptions) => {
  if (opts.connection instanceof Pool) {
    return createPostgresBackend(name, { ...opts, connection: opts.connection }, factoryOptions);
  }
  return createRedisBackend(name, { ...opts, connection: opts.connection as ConnectionOptions }, factoryOptions);
};
export const { Queue, Worker } = withBackend(backendFactory);

let pool: Pool | undefined;

export async function initQueueBackend(config: ServerConfig, workerCount = 11): Promise<void> {
  if (config.backgroundJobs?.backend !== 'postgres') {
    return;
  }
  if (pool) {
    throw new Error('Background job PostgreSQL pool is already initialized');
  }
  const { connectionString, maxConnections = 32 } = config.backgroundJobs.postgres;
  // Each enabled worker holds a LISTEN connection checked out of this shared pool.
  if (maxConnections <= workerCount) {
    throw new Error(`backgroundJobs.postgres.maxConnections must exceed the ${workerCount} enabled workers`);
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('backgroundJobs.postgres.connectionString must be a PostgreSQL URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('backgroundJobs.postgres.connectionString must be a PostgreSQL URL');
  }
  if (url.searchParams.has('options')) {
    throw new Error('backgroundJobs.postgres.connectionString must not set options');
  }
  url.searchParams.set('options', '-c search_path=bullmq,public');
  const newPool = new Pool({ connectionString: url.toString(), max: maxConnections, connectionTimeoutMillis: 5_000 });
  // BullMQ attaches a pool error listener for every queue and worker backend.
  newPool.setMaxListeners(64);
  newPool.on('error', (err) => globalLogger.error('Background job PostgreSQL pool error', { err }));
  try {
    const client = await newPool.connect();
    try {
      await runMigrations(client);
    } finally {
      client.release();
    }
    pool = newPool;
  } catch (err) {
    await newPool.end();
    throw err;
  }
}

export async function closeQueueBackend(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        current.end(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Timed out closing background job PostgreSQL pool')), 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getQueueBackendOptions(config: ServerConfig): QueueConnection {
  if (config.backgroundJobs?.backend === 'postgres') {
    if (!pool) {
      throw new Error('Background job PostgreSQL pool is not initialized');
    }
    return pool;
  }
  return { ...(config.backgroundJobsRedis ?? config.redis), reconnectOnError };
}

export async function testQueueBackend(): Promise<boolean | undefined> {
  if (!pool) {
    return undefined;
  }
  try {
    const query = { text: 'SELECT 1 FROM bullmq.job LIMIT 0', query_timeout: 5_000 };
    await pool.query(query);
    return true;
  } catch {
    return false;
  }
}
