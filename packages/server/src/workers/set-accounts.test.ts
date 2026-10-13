// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import type { Mock } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { ServerConfig } from '../config/utils';
import type { Repository, SystemRepository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { getAsyncJobTracking } from './base';
import type { SetAccountsJobData } from './set-accounts';
import { initSetAccountsWorker } from './set-accounts';

describe('Set-accounts worker', () => {
  let config: ServerConfig;
  let repo: Repository;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initAppServices(config);

    const project = await createTestProject({ withRepo: true });
    repo = project.repo;
    systemRepo = repo.getSystemRepo();
  });

  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function createAsyncJob(status: AsyncJob['status'] = 'accepted'): Promise<WithId<AsyncJob>> {
    return repo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status,
      request: 'https://example.com/fhir/R4',
      requestTime: new Date().toISOString(),
    });
  }

  // Captures the `failed` handler registered by initSetAccountsWorker itself. It is the last one
  // registered, after the logging-only listener added by addVerboseQueueLogging.
  function captureFailedHandler(): (job: Job<SetAccountsJobData> | undefined, err: Error) => Promise<void> {
    const { worker } = initSetAccountsWorker(config);
    expect(vi.mocked(Worker)).toHaveBeenCalled();
    const onCalls = (worker?.on as unknown as Mock).mock.calls as [string, (...args: any[]) => any][];
    return onCalls.filter((c) => c[0] === 'failed').at(-1)?.[1] as (
      job: Job<SetAccountsJobData> | undefined,
      err: Error
    ) => Promise<void>;
  }

  function makeJob(asyncJob: WithId<AsyncJob>): Job<SetAccountsJobData> {
    return {
      id: 'test-job',
      data: { tracking: getAsyncJobTracking(asyncJob) },
    } as unknown as Job<SetAccountsJobData>;
  }

  describe('failed handler', () => {
    test('No-op when there is no job', async () => {
      const failedHandler = captureFailedHandler();
      await expect(failedHandler(undefined, new Error('x'))).resolves.toBeUndefined();
    });

    test('Fails the active AsyncJob', () =>
      withTestContext(async () => {
        const failedHandler = captureFailedHandler();
        const asyncJob = await createAsyncJob();

        await failedHandler(makeJob(asyncJob), new Error('boom'));

        expect((await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id)).status).toStrictEqual('error');
      }));

    test.each<AsyncJob['status']>(['completed', 'cancelled'])('Leaves a %s AsyncJob untouched', (status) =>
      withTestContext(async () => {
        const failedHandler = captureFailedHandler();
        const asyncJob = await createAsyncJob(status);

        await failedHandler(makeJob(asyncJob), new Error('boom'));

        expect((await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id)).status).toStrictEqual(status);
      })
    );
  });
});
