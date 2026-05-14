// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, FileBuilder } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { generateMigrationActions, writePreDeployActionsToBuilder } from '../../migrations/migrate';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'db-schema-diff',
    code: 'schema-diff',
    parameter: [
      {
        use: 'out',
        name: 'migrationString',
        type: 'string',
        min: 1,
        max: '1',
      },
    ],
  }
);

export async function dbSchemaDiffHandler(_req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const dbClient = getDatabasePool(DatabaseMode.READER);
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
