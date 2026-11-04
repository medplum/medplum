// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { ServerConfig } from '../config/utils';
import {
  closeQueueBackend,
  getQueueBackendOptions,
  initQueueBackend,
  Queue,
  testQueueBackend,
  Worker,
} from './backend';

// Run explicitly with an isolated database: MEDPLUM_TEST_QUEUE_DATABASE_URL=postgres://... bunx vitest run --config vite.postgres.config.ts
const connectionString = process.env.MEDPLUM_TEST_QUEUE_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration('PostgreSQL background jobs', () => {
  const config = {
    backgroundJobs: {
      backend: 'postgres',
      postgres: { connectionString: connectionString as string, maxConnections: 8 },
    },
  } as unknown as ServerConfig;
  let queue: InstanceType<typeof Queue>;
  let workers: { close(): Promise<void> }[];

  async function waitFor(condition: () => boolean | Promise<boolean>, timeout = 15_000): Promise<void> {
    const end = Date.now() + timeout;
    while (!(await condition())) {
      if (Date.now() >= end) {
        throw new Error('Timed out waiting for queue condition');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  beforeEach(async () => {
    workers = [];
    await initQueueBackend(config, 2);
    queue = new Queue(`integration-${randomUUID()}`, { connection: getQueueBackendOptions(config) });
    await queue.waitUntilReady();
  });

  afterEach(async () => {
    for (const worker of workers) {
      await worker.close();
    }
    await queue.obliterate({ force: true });
    await queue.close();
    await closeQueueBackend();
  });

  test('migrates, reports health, processes a job and persists it across backend restart', async () => {
    expect(await testQueueBackend()).toBe(true);
    const job = await queue.add('persist', { value: 42 });
    await queue.close();
    await closeQueueBackend();
    expect(await testQueueBackend()).toBeUndefined();

    await initQueueBackend(config, 2);
    queue = new Queue(queue.name, { connection: getQueueBackendOptions(config) });
    const seen: unknown[] = [];
    workers.push(
      new Worker(
        queue.name,
        async (item) => {
          seen.push(item.data);
        },
        { connection: getQueueBackendOptions(config) }
      )
    );
    await waitFor(
      async () => (await queue.getJob(job.id as string))?.getState().then((state) => state === 'completed') ?? false
    );
    expect(seen).toEqual([{ value: 42 }]);
  });

  test('retries a failed job after its backoff', async () => {
    const attempts: number[] = [];
    workers.push(
      new Worker(
        queue.name,
        async () => {
          attempts.push(Date.now());
          if (attempts.length === 1) {
            throw new Error('retry');
          }
        },
        { connection: getQueueBackendOptions(config) }
      )
    );
    const job = await queue.add('retry', {}, { attempts: 2, backoff: { type: 'fixed', delay: 300 } });
    await waitFor(
      async () => (await queue.getJob(job.id as string))?.getState().then((state) => state === 'completed') ?? false
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(250);
  });

  test('runs a recurring scheduler and removes it', async () => {
    let count = 0;
    workers.push(
      new Worker(
        queue.name,
        async () => {
          count++;
        },
        { connection: getQueueBackendOptions(config) }
      )
    );
    await queue.upsertJobScheduler('periodic', { pattern: '* * * * * *' }, { name: 'tick', data: {} });
    await waitFor(() => count >= 2);
    expect(await queue.removeJobScheduler('periodic')).toBe(true);
    expect(await queue.getJobScheduler('periodic')).toBeUndefined();
  });

  test('honors worker concurrency', async () => {
    let active = 0;
    let peak = 0;
    let finished = 0;
    workers.push(
      new Worker(
        queue.name,
        async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 250));
          active--;
          finished++;
        },
        { connection: getQueueBackendOptions(config), concurrency: 2 }
      )
    );
    await Promise.all(Array.from({ length: 4 }, () => queue.add('parallel', {})));
    await waitFor(() => finished === 4);
    expect(peak).toBe(2);
  });

  test('enforces global concurrency across workers', async () => {
    let active = 0;
    let peak = 0;
    let finished = 0;
    await queue.setGlobalConcurrency(1);
    const processor = async (): Promise<void> => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 150));
      active--;
      finished++;
    };
    workers.push(new Worker(queue.name, processor, { connection: getQueueBackendOptions(config), concurrency: 2 }));
    workers.push(new Worker(queue.name, processor, { connection: getQueueBackendOptions(config), concurrency: 2 }));
    await Promise.all(Array.from({ length: 4 }, () => queue.add('global', {})));
    await waitFor(() => finished === 4);
    expect(peak).toBe(1);
  });
});

integration('Medplum worker registration', () => {
  test('initializes every queue on PostgreSQL even when processing is disabled', async () => {
    const { PostgresQueueBackend } = await import('bullmq');
    const { initWorkers, closeWorkers } = await import('./index');
    const { queueRegistry } = await import('./utils');
    const config = {
      backgroundJobs: {
        backend: 'postgres',
        postgres: { connectionString: connectionString as string, maxConnections: 8 },
      },
      workers: { enabled: [] },
    } as unknown as ServerConfig;
    const names = [
      'DispatchQueue',
      'SubscriptionQueue',
      'DownloadQueue',
      'CronQueue',
      'ReindexQueue',
      'BatchQueue',
      'BulkExportQueue',
      'PostDeployMigrationQueue',
      'SetAccountsQueue',
      'LambdaCleanerQueue',
      'DicomQueue',
    ];
    try {
      await initWorkers(config);
      for (const name of names) {
        const queue = queueRegistry.get(name);
        expect(queue, name).toBeDefined();
        expect(queue?.backend, name).toBeInstanceOf(PostgresQueueBackend);
        const job = await queue?.add('integration-test', { name });
        expect((await queue?.getJob(job?.id as string))?.data).toEqual({ name });
        await job?.remove();
      }
    } finally {
      await closeWorkers();
    }
    for (const name of names) {
      expect(queueRegistry.get(name)).toBeUndefined();
    }
    expect(await testQueueBackend()).toBeUndefined();
  }, 60_000);
});

const redisUrl = process.env.MEDPLUM_TEST_QUEUE_REDIS_URL;
const redisIntegration = redisUrl ? describe : describe.skip;
redisIntegration('default Redis background jobs', () => {
  test('processes a job through the Medplum factory without a backend setting', async () => {
    const { RedisQueueBackend } = await import('bullmq');
    const url = new URL(redisUrl as string);
    const config = {
      redis: {
        host: url.hostname,
        port: Number(url.port),
        password: decodeURIComponent(url.password),
        db: Number(url.pathname.slice(1)),
      },
    } as ServerConfig;
    const name = `integration-${randomUUID()}`;
    await initQueueBackend(config, 1);
    const queue = new Queue(name, { connection: getQueueBackendOptions(config) });
    const seen: unknown[] = [];
    const worker = new Worker(
      name,
      async (job) => {
        seen.push(job.data);
      },
      { connection: getQueueBackendOptions(config) }
    );
    try {
      expect(queue.backend).toBeInstanceOf(RedisQueueBackend);
      const job = await queue.add('smoke', { value: 42 });
      const deadline = Date.now() + 15_000;
      while ((await job.getState()) !== 'completed') {
        if (Date.now() >= deadline) {
          throw new Error('Timed out waiting for Redis job');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(seen).toEqual([{ value: 42 }]);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await closeQueueBackend();
    }
  });
});
