// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes } from '@medplum/core';
import { PoolClient } from 'pg';
import { systemResourceProjectId } from '../../constants';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { withLongRunningDatabaseClient } from '../migration-utils';
import { MigrationActionResult } from '../types';
import { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => {
    return runCustomMigration(repo, job, jobData, async () => {
      return withLongRunningDatabaseClient(async (client) => {
        const results: MigrationActionResult[] = [];
        await run(client, results);
        return results;
      });
    });
  },
};

// prettier-ignore
async function run(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.nonBlockingAddConstraint(client, results, 'Project', 'reserved_project_id_check', `id <> '65897e4f-7add-55f3-9b17-035b5a4e6d52'`);

  const resourceTypes = getResourceTypes();
  for (const resourceType of resourceTypes) {
    await fns.query(client, results, `UPDATE "${resourceType}" SET "projectId" = $1 WHERE "projectId" IS NULL`, [systemResourceProjectId]);
    await fns.nonBlockingAlterColumnNotNull(client, results, resourceType, `projectId`);
  }
}
