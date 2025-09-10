// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getResourceTypes } from '@medplum/core';
import { PoolClient } from 'pg';
import { systemResourceProjectId } from '../../constants';
import { Column, SelectQuery, UpdateQuery } from '../../fhir/sql';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { MigrationActionResult } from '../types';
import { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.nonBlockingAddCheckConstraint(client, results, 'Project', 'reserved_project_id_check', `id <> '65897e4f-7add-55f3-9b17-035b5a4e6d52'`);

  const resourceTypes = getResourceTypes();
  for (const resourceType of resourceTypes) {
    const cte = { name: 'cte', expr: new SelectQuery(resourceType).column('id').where('projectId', '=', null).orderBy('lastUpdated').limit(1000) };
    const updateQuery = new UpdateQuery(resourceType, ['projectId']);
    updateQuery.set('projectId', systemResourceProjectId);
    updateQuery.from(cte);
    updateQuery.where(new Column(cte.name, 'id'), '=', new Column(resourceType, 'id'));
    await fns.batchedUpdate(client, results, updateQuery, Infinity);
    await fns.nonBlockingAlterColumnNotNull(client, results, resourceType, `projectId`);
  }
}
