import { WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { Repository } from '../../fhir/repo';
import { PostDeployMigrationJobData } from '../../workers/post-deploy-migration';

export interface Migration {
  run(repo: Repository, asyncJob: WithId<AsyncJob>, isFirstServerStart: boolean): Promise<void>;
}

export type PostDeployMigrationAction = { name: string; durationMs: number };
export type PostDeployMigrationResult = PostDeployMigrationAction[];

export interface PostDeployMigration extends Migration {
  process(job: Job<PostDeployMigrationJobData>): Promise<PostDeployMigrationResult>;
}
