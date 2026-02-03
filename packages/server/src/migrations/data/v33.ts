// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes } from '@medplum/core';
import type { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  // Copy existing deleted rows from main tables to Deleted_<ResourceType> tables.
  // This migration does NOT remove deleted rows from the main tables for safety.
  // A follow-up migration will clean up the main tables after verification.
  const resourceTypes = getResourceTypes();
  for (const resourceType of resourceTypes) {
    if (resourceType === 'Binary') {
      // Binary does not have compartments column
      await fns.query(client, results, `
        INSERT INTO "Deleted_${resourceType}" ("id", "projectId", "lastUpdated")
        SELECT "id", "projectId", "lastUpdated"
        FROM "${resourceType}"
        WHERE "deleted" = true
        ON CONFLICT (id) DO NOTHING
      `);
    } else {
      await fns.query(client, results, `
        INSERT INTO "Deleted_${resourceType}" ("id", "projectId", "lastUpdated", "compartments")
        SELECT "id", "projectId", "lastUpdated", "compartments"
        FROM "${resourceType}"
        WHERE "deleted" = true
        ON CONFLICT (id) DO NOTHING
      `);
    }
  }
}
