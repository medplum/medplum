// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { Mock } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { getUserConfiguration } from '../auth/me';
import { loadTestConfig } from '../config/loader';
import type { ServerConfig } from '../config/utils';
import { runInAuthenticatedContext } from '../context';
import { BulkExporter } from '../fhir/operations/utils/bulkexporter';
import type { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import { createTestProject, withTestContext } from '../test.setup';
import { getAsyncJobTracking } from './base';
import type { BulkExportJobData } from './bulk-export';
import { execBulkExportJob, initBulkExportWorker, queueBulkExport } from './bulk-export';
import { queueRegistry } from './utils';

describe('Bulk export worker', () => {
  let config: ServerConfig;
  let repo: Repository;
  let authState: AuthState;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initAppServices(config);
    const setup = await createTestProject({ withClient: true, withAccessToken: true, withRepo: true });
    repo = setup.repo;
    authState = {
      login: setup.login,
      project: setup.project,
      membership: setup.membership,
      userConfig: await getUserConfiguration(repo.getSystemRepo(), setup.project, setup.membership),
    };
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(shutdownApp);

  async function setupJob(): Promise<{ asyncJob: WithId<AsyncJob>; job: Job<BulkExportJobData> }> {
    const asyncJob = await new BulkExporter(repo).start('https://example.com/fhir/R4/$export');
    const data: BulkExportJobData = { tracking: getAsyncJobTracking(asyncJob), authState, exportLevel: 'System' };
    return { asyncJob, job: { data, queueName: 'BulkExportQueue' } as Job<BulkExportJobData> };
  }

  test('Throws when the queue is not available', () =>
    withTestContext(async () => {
      const { asyncJob } = await setupJob();
      vi.spyOn(queueRegistry, 'get').mockReturnValue(undefined);
      await expect(
        runInAuthenticatedContext(authState, undefined, undefined, undefined, () =>
          queueBulkExport(asyncJob, { exportLevel: 'System' })
        )
      ).rejects.toThrow('Job queue BulkExportQueue not available');
    }));

  test('Skips jobs that are no longer active', () =>
    withTestContext(async () => {
      const { asyncJob, job } = await setupJob();
      await repo.getSystemRepo().updateResource<AsyncJob>({ ...asyncJob, status: 'cancelled' });
      const writeResource = vi.spyOn(BulkExporter.prototype, 'writeResource');
      await execBulkExportJob(job);
      expect(writeResource).not.toHaveBeenCalled();
      expect((await repo.readResource<AsyncJob>('AsyncJob', asyncJob.id)).status).toBe('cancelled');
    }));

  test('Failed jobs mark the AsyncJob as error', () =>
    withTestContext(async () => {
      const { worker } = initBulkExportWorker(config);
      const onCalls = (worker?.on as unknown as Mock).mock.calls as [string, (...args: any[]) => Promise<void>][];
      const failedHandler = onCalls.find((c) => c[0] === 'failed')?.[1];
      const { asyncJob, job } = await setupJob();

      await failedHandler?.(undefined, new Error('No job'));
      await failedHandler?.(job, new Error('Export failed'));
      expect((await repo.readResource<AsyncJob>('AsyncJob', asyncJob.id)).status).toBe('error');
    }));

  test('Failed handler does not overwrite a cancelled AsyncJob', () =>
    withTestContext(async () => {
      const { worker } = initBulkExportWorker(config);
      const onCalls = (worker?.on as unknown as Mock).mock.calls as [string, (...args: any[]) => Promise<void>][];
      const failedHandler = onCalls.find((c) => c[0] === 'failed')?.[1];
      const { asyncJob, job } = await setupJob();
      await repo.getSystemRepo().updateResource<AsyncJob>({ ...asyncJob, status: 'cancelled' });

      await failedHandler?.(job, new Error('Export failed'));
      expect((await repo.readResource<AsyncJob>('AsyncJob', asyncJob.id)).status).toBe('cancelled');
    }));

  test('Failed handler logs instead of rejecting when the AsyncJob cannot be read', () =>
    withTestContext(async () => {
      const { worker } = initBulkExportWorker(config);
      const onCalls = (worker?.on as unknown as Mock).mock.calls as [string, (...args: any[]) => Promise<void>][];
      const failedHandler = onCalls.find((c) => c[0] === 'failed')?.[1];
      const { job } = await setupJob();
      const errorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => undefined);
      const missingJob = {
        ...job,
        data: { ...job.data, tracking: { ...job.data.tracking, asyncJobId: randomUUID() } },
      } as Job<BulkExportJobData>;

      await expect(failedHandler?.(missingJob, new Error('Export failed'))).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Failed to mark bulk export as failed', expect.any(Object));
    }));
});
