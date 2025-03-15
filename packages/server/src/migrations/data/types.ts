import { WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { Repository } from '../../fhir/repo';
import { CustomMigrationJobData, CustomMigrationResult } from '../../workers/post-deploy-migration';

export interface PostDeployMigration {
  type: 'reindex' | 'custom';
  run(repo: Repository, asyncJob: WithId<AsyncJob>): Promise<void>;
}

export interface ReindexPostDeployMigration extends PostDeployMigration {
  type: 'reindex';
}

export interface CustomPostDeployMigration extends PostDeployMigration {
  type: 'custom';
  process(job: Job<CustomMigrationJobData>): Promise<CustomMigrationResult>;
}
