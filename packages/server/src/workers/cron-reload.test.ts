// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as MedplumCore from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import type { Queue } from 'bullmq';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { createTestProject, withTestContext } from '../test.setup';
import type { CronJobData } from './cron';
import { getCronQueue, reloadCronBots } from './cron';

// The smallest page size that still uses cursor pagination, so a handful of bots spans several pages, without the
// pause between pages
vi.mock('@medplum/core', async (importOriginal) => ({
  ...(await importOriginal<typeof MedplumCore>()),
  DEFAULT_MAX_SEARCH_COUNT: 20,
  sleep: async () => undefined,
}));

describe('reloadCronBots', () => {
  beforeAll(async () => {
    await initAppServices(await loadTestConfig());
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Pages past maxSearchOffset', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });
      const bots: Bot[] = [];
      for (let i = 0; i < 25; i++) {
        bots.push(await repo.createResource<Bot>({ resourceType: 'Bot', cronString: '*/20 * * * *' }));
      }

      const upsertJobSchedulerSpy = vi.spyOn(getCronQueue() as Queue<CronJobData>, 'upsertJobScheduler');
      const prevMaxSearchOffset = getConfig().maxSearchOffset;
      // Offset pagination would throw on its second page
      getConfig().maxSearchOffset = 0;
      try {
        await reloadCronBots(PLACEHOLDER_SHARD_ID);
      } finally {
        getConfig().maxSearchOffset = prevMaxSearchOffset;
      }

      const registered = new Set(upsertJobSchedulerSpy.mock.calls.map(([schedulerId]) => schedulerId));
      for (const bot of bots) {
        expect(registered).toContain(bot.id);
      }
    }));
});
