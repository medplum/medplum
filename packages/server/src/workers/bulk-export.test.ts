// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { assert } from '@medplum/core';
import type { AsyncJob, Binary, Patient } from '@medplum/fhirtypes';
import type { Job, Queue, Worker } from 'bullmq';
import { DelayedError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { getUserConfiguration } from '../auth/me';
import { loadTestConfig } from '../config/loader';
import { runInAuthenticatedContext } from '../context';
import { BulkExporter } from '../fhir/operations/utils/bulkexporter';
import type { Repository } from '../fhir/repo';
import type { AuthState } from '../oauth/middleware';
import { getBinaryStorage } from '../storage/loader';
import { createTestProject, streamToString, withTestContext } from '../test.setup';
import { getAsyncJobTracking } from './base';
import type { BulkExportJobData } from './bulk-export';
import { execBulkExportJob, queueBulkExport } from './bulk-export';
import { defaultQueueOptions, queueRegistry } from './utils';

describe('Bulk export worker', () => {
  let repo: Repository;
  let authState: AuthState;
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.asyncDelayScaling = 0;
    await initAppServices(config);
    const setup = await createTestProject({ withClient: true, withAccessToken: true, withRepo: true });
    repo = setup.repo;
    authState = {
      login: setup.login,
      project: setup.project,
      membership: setup.membership,
      userConfig: await getUserConfiguration(repo.getSystemRepo(), setup.project, setup.membership),
    };
    await withTestContext(async () => {
      await repo.createResource<Patient>({ resourceType: 'Patient' });
      await repo.createResource<Patient>({ resourceType: 'Patient' });
    });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(shutdownApp);

  async function setupJob(): Promise<Job<BulkExportJobData>> {
    const resource = await new BulkExporter(repo).start('https://example.com/fhir/R4/$export?_type=Patient');
    return {
      data: { tracking: getAsyncJobTracking(resource), authState, exportLevel: 'System', types: ['Patient'] },
      queueName: 'BulkExportQueue',
      token: 'test-token',
      moveToDelayed: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<BulkExportJobData>;
  }

  test('Interruption after a write replays with fresh files and the same AsyncJob', () =>
    withTestContext(async () => {
      const job = await setupJob();
      let closing = false;
      vi.spyOn(queueRegistry, 'isClosing').mockImplementation(() => closing);
      const write = BulkExporter.prototype.writeResource;
      const writes = vi.spyOn(BulkExporter.prototype, 'writeResource').mockImplementation(async function (
        this: BulkExporter,
        resource,
        options
      ) {
        await write.call(this, resource, options);
        closing = true;
      });
      const abort = vi.spyOn(BulkExporter.prototype, 'abort');
      vi.mocked(job.moveToDelayed).mockImplementation(async () => {
        expect(abort).toHaveResolved();
      });
      await expect(execBulkExportJob(job)).rejects.toBeInstanceOf(DelayedError);
      expect(job.moveToDelayed).toHaveBeenCalled();
      expect((await repo.readResource<AsyncJob>('AsyncJob', job.data.tracking.asyncJobId)).status).toBe('active');
      writes.mockRestore();
      closing = false;
      // No exporter, stream, or dedupe state survives into this invocation.
      const resumed = { ...job, data: JSON.parse(JSON.stringify(job.data)) } as Job<BulkExportJobData>;
      await execBulkExportJob(resumed);
      const completed = await repo.readResource<AsyncJob>('AsyncJob', job.data.tracking.asyncJobId);
      expect(completed.status).toBe('completed');
      const outputs = completed.output?.parameter;
      expect(outputs).toHaveLength(1);
      const ref = outputs?.[0].part?.find((part) => part.name === 'url')?.valueUri as string;
      const binary = await repo.readResource<Binary>('Binary', ref.split('/')[1]);
      const lines = (await streamToString(await getBinaryStorage().readBinary(binary))).trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(new Set(lines.map((line) => JSON.parse(line).id)).size).toBe(2);
      await execBulkExportJob(resumed);
      expect((await repo.readResource<AsyncJob>('AsyncJob', completed.id)).meta?.versionId).toBe(
        completed.meta?.versionId
      );
    }));

  test('A replacement BullMQ worker recovers a stalled export from Redis', () =>
    withTestContext(async () => {
      const bullmq = await vi.importActual<{ Queue: typeof Queue; Worker: typeof Worker }>('bullmq');
      const config = await loadTestConfig();
      const connection = defaultQueueOptions(config).connection;
      const queueName = 'BulkExportSpike-' + randomUUID();
      const queue = new bullmq.Queue<BulkExportJobData>(queueName, { connection });
      let release!: () => void;
      let started!: () => void;
      const running = new Promise<void>((resolve) => {
        started = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = new bullmq.Worker(
        queueName,
        async () => {
          started();
          await blocked;
        },
        {
          connection,
          lockDuration: 500,
          stalledInterval: 500,
        }
      );
      let replacement: Worker<BulkExportJobData, void> | undefined;
      try {
        const job = await setupJob();
        await queue.add('BulkExport', job.data);
        await running;
        // Stop renewing the active job's lock without acknowledging completion.
        await first.close(true);
        replacement = new bullmq.Worker(queueName, execBulkExportJob, {
          connection,
          lockDuration: 500,
          stalledInterval: 500,
        });
        await new Promise<void>((resolve, reject) => {
          replacement?.on('completed', () => resolve());
          replacement?.on('failed', (_job, err) => reject(err));
          replacement?.on('error', reject);
        });
        expect((await repo.readResource<AsyncJob>('AsyncJob', job.data.tracking.asyncJobId)).status).toBe('completed');
      } finally {
        release();
        await first.close(true);
        await replacement?.close(true);
        await queue.obliterate({ force: true });
        await queue.close();
      }
    }));

  test('Upload failures mark the AsyncJob failed before the processor rejects', () =>
    withTestContext(async () => {
      const job = await setupJob();
      vi.spyOn(getBinaryStorage(), 'writeBinary').mockRejectedValue(new Error('Upload unavailable'));
      await expect(execBulkExportJob(job)).rejects.toThrow('Upload unavailable');
      const failed = await repo.readResource<AsyncJob>('AsyncJob', job.data.tracking.asyncJobId);
      expect(failed.status).toBe('error');
      expect(failed.output?.parameter).toEqual([{ name: 'error', valueString: 'Upload unavailable' }]);
    }));

  test('Enqueue failure does not leave an active AsyncJob', () =>
    withTestContext(async () => {
      const job = await setupJob();
      const resource = await repo.readResource<AsyncJob>('AsyncJob', job.data.tracking.asyncJobId);
      const queue = queueRegistry.get('BulkExportQueue');
      assert(queue);
      vi.mocked(queue.add).mockRejectedValueOnce(new Error('Redis unavailable'));
      await expect(
        runInAuthenticatedContext(authState, undefined, undefined, undefined, () =>
          queueBulkExport(resource, { exportLevel: 'System', types: ['Patient'] })
        )
      ).rejects.toThrow('Redis unavailable');
      expect((await repo.readResource<AsyncJob>('AsyncJob', resource.id)).status).toBe('error');
    }));

  test('Cancelled jobs are not replayed', () =>
    withTestContext(async () => {
      const job = await setupJob();
      const resource = await repo.readResource<AsyncJob>('AsyncJob', job.data.tracking.asyncJobId);
      await repo.updateResource({ ...resource, status: 'cancelled' });
      const write = vi.spyOn(BulkExporter.prototype, 'writeResource');
      await execBulkExportJob(job);
      expect(write).not.toHaveBeenCalled();
    }));
});
