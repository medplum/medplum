import { WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { Repository } from '../../fhir/repo';
import { CustomMigrationJobData, CustomMigrationResult } from '../../workers/post-deploy-migration';

export interface PostDeployMigration {
  run(repo: Repository, asyncJob: WithId<AsyncJob>, isFirstServerStart: boolean): Promise<void>;
}

export interface ReindexPostDeployMigration extends PostDeployMigration {
  type: 'reindex';
}

export interface CustomPostDeployMigration extends PostDeployMigration {
  type: 'custom';
  process(job: Job<CustomMigrationJobData>): Promise<CustomMigrationResult>;
}
