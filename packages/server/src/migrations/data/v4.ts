import { sleep } from '@medplum/core';
import { Job } from 'bullmq';
import { DatabaseMode, getDatabasePool } from '../../database';
import { AsyncJobExecutor } from '../../fhir/operations/utils/asyncjobexecutor';
import { globalLogger } from '../../logger';
import { addPostDeployMigrationJob, PostDeployMigrationJobData } from '../../workers/post-deploy-migration';
import { PostDeployMigration, PostDeployMigrationResult } from './migration';

export const run: PostDeployMigration['run'] = async (repo, asyncJob, isFirstServerStart) => {
  const exec = new AsyncJobExecutor(repo, asyncJob);
  await exec.run(async (_asyncJob) => {
    await addPostDeployMigrationJob(
      {
        type: 'post-deploy-migration',
        asyncJob,
      },
      isFirstServerStart,
      {
        jobOptions: {
          attempts: 0,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }
    );
  });
};

export const process: PostDeployMigration['process'] = async (
  job: Job<PostDeployMigrationJobData>
): Promise<PostDeployMigrationResult> => {
  const actions: PostDeployMigrationResult = [];

  const pool = getDatabasePool(DatabaseMode.WRITER);
  await pool.query(`SET statement_timeout TO 0`);

  const sleepTime = 5000;
  globalLogger.info(`About to throw an error in ${sleepTime} seconds...`, {
    job: job.id,
    attemptsMade: job.attemptsMade,
    attemptsStarted: job.attemptsStarted,
  });
  await sleep(sleepTime);
  throw new Error('Uh oh, we had an error');

  return actions;
};
