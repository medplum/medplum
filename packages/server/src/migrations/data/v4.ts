import { sleep } from '@medplum/core';
import { Job } from 'bullmq';
import { DatabaseMode, getDatabasePool } from '../../database';
import { AsyncJobExecutor } from '../../fhir/operations/utils/asyncjobexecutor';
import { globalLogger } from '../../logger';
import {
  addPostDeployMigrationJob,
  CustomMigrationAction,
  CustomMigrationJobData,
  CustomMigrationResult,
} from '../../workers/post-deploy-migration';
import { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  run: async (repo, asyncJob) => {
    const exec = new AsyncJobExecutor(repo, asyncJob);
    await exec.run(async () => {
      await addPostDeployMigrationJob({
        type: 'custom',
        asyncJob,
      });
    });
  },
  process: async (job: Job<CustomMigrationJobData>): Promise<CustomMigrationResult> => {
    const actions: CustomMigrationAction[] = [];

    const pool = getDatabasePool(DatabaseMode.WRITER);
    await pool.query(`SET statement_timeout TO 0`);

    const sleepTime = 5000;
    globalLogger.info(`Sleeping for ${sleepTime} seconds...`, {
      job: job.id,
      attemptsMade: job.attemptsMade,
      attemptsStarted: job.attemptsStarted,
    });
    await sleep(sleepTime);
    actions.push({ name: 'sleep', durationMs: sleepTime });

    throw new Error('Uh oh, we had an error. The job should retry.');

    return { actions };
  },
};
