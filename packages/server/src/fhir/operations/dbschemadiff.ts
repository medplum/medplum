// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, FileBuilder } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { generateMigrationActions, writePreDeployActionsToBuilder } from '../../migrations/migrate';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-schema-diff',
  status: 'active',
  kind: 'operation',
  code: 'schema-diff',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'shardId',
      type: 'string',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'migrationString',
      type: 'string',
      min: 1,
      max: '1',
    },
  ],
};

export async function dbSchemaDiffHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ shardId: string }>(operation, req);

  const dbClient = getDatabasePool(DatabaseMode.READER, params.shardId);
  const b = new FileBuilder('  ', false);
  b.append('// The schema migration needed to match the expected schema');
  b.append('');

  const actions = await generateMigrationActions({
    dbClient,
    dropUnmatchedIndexes: true,
  });

  writePreDeployActionsToBuilder(b, [...actions.preDeploy, ...actions.postDeploy]);

  return [allOk, buildOutputParameters(operation, { migrationString: b.toString() })];
}
