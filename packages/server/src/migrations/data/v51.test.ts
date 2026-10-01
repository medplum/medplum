// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AsyncJob, Bot } from '@medplum/fhirtypes';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getShardSystemRepo, Repository } from '../../fhir/repo';
import { GLOBAL_SHARD_ID } from '../../fhir/sharding';
import { globalLogger } from '../../logger';
import { createTestProject, withTestContext } from '../../test.setup';
import type { CronJobData } from '../../workers/cron';
import { getCronQueue } from '../../workers/cron';
import { migration } from './v51';

describe('Post-deploy migration v51', () => {
  const systemRepo = getShardSystemRepo(GLOBAL_SHARD_ID);

  beforeAll(async () => {
    await initAppServices(await loadTestConfig());
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Re-registers cron schedules with current job data, skipping ones without a project', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });
      const bot = await repo.createResource<Bot>({ resourceType: 'Bot', cronString: '*/20 * * * *' });
      const sameProjectBot = await repo.createResource<Bot>({ resourceType: 'Bot', cronString: '0 * * * *' });

      // Bots without a readable project can't be re-registered, but must not stop the rest of the reload
      const orphanedBot = await systemRepo.createResource<Bot>({
        resourceType: 'Bot',
        meta: { project: randomUUID() },
        cronString: '*/20 * * * *',
      });
      const projectlessBot = await systemRepo.createResource<Bot>({ resourceType: 'Bot', cronString: '*/20 * * * *' });

      const asyncJob = await systemRepo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        dataVersion: 51,
        requestTime: new Date().toISOString(),
        request: '/admin/super/migrate',
      });

      const cronQueue = getCronQueue() as Queue<CronJobData>;
      const obliterateSpy = vi.spyOn(cronQueue, 'obliterate');
      const upsertJobSchedulerSpy = vi.spyOn(cronQueue, 'upsertJobScheduler');
      const errorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => undefined);
      const readResourceSpy = vi.spyOn(Repository.prototype, 'readResource');

      const result = await migration.run(systemRepo, undefined, migration.prepareJobData(asyncJob));

      expect(result).toBe('finished');
      expect(obliterateSpy).toHaveBeenCalledWith({ force: true });
      expect(upsertJobSchedulerSpy).toHaveBeenCalledWith(
        bot.id,
        { pattern: '*/20 * * * *' },
        { data: { resourceType: 'Bot', botId: bot.id, target: expect.objectContaining({ kind: 'project' }) } }
      );
      expect(upsertJobSchedulerSpy).toHaveBeenCalledWith(
        sameProjectBot.id,
        { pattern: '0 * * * *' },
        expect.any(Object)
      );
      expect(readResourceSpy.mock.calls.filter(([, id]) => id === project.id)).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledWith('Cannot reload cron job, project not found', {
        botId: orphanedBot.id,
        projectId: orphanedBot.meta?.project,
      });
      expect(errorSpy).toHaveBeenCalledWith('Cannot reload cron job, project not found', {
        botId: projectlessBot.id,
        projectId: undefined,
      });
      const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
      expect(updatedJob.status).toBe('completed');
    }));
});
