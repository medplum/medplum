import { sleep } from '@medplum/core';
import { globalLogger } from '../../logger';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import { CustomMigrationAction, CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, jobData) => {
    return runCustomMigration(repo, jobData, async () => {
      const actions: CustomMigrationAction[] = [];

      const sleepTime = 7000;
      globalLogger.info(`Sleeping for ${sleepTime} seconds...`);
      await sleep(sleepTime);
      actions.push({ name: 'sleep', durationMs: sleepTime });

      return { actions };
    });
  },
};
