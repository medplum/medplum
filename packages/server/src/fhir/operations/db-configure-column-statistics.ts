// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { requireSuperAdmin } from '../../context';
import { DatabaseMode, getDatabasePool, withPoolClient } from '../../database';
import { isValidPostgresIdentifier } from '../sql';
import { makeOperationDefinition } from './definitions';
import { makeOperationDefinitionParameter as param, parseInputParameters } from './utils/parameters';

const UpdateOperation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'db-configure-column-statistics',
    code: 'db-configure-column-statistics',
    parameter: [
      param('in', 'tableName', 'string', 1, '1'),
      param('in', 'columnNames', 'string', 1, '*'),
      param('in', 'resetToDefault', 'boolean', 1, '1'),
      param('in', 'newStatisticsTarget', 'integer', 0, '1'),
    ],
  }
);

export async function configureColumnStatisticsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();
  const params = parseInputParameters<{
    tableName: string;
    columnNames: string[];
    resetToDefault: boolean;
    newStatisticsTarget?: number;
  }>(UpdateOperation, req);

  if (!isValidPostgresIdentifier(params.tableName)) {
    throw new OperationOutcomeError(badRequest('Invalid tableName'));
  }

  for (const columnName of params.columnNames) {
    if (!isValidPostgresIdentifier(columnName)) {
      throw new OperationOutcomeError(badRequest('Invalid columnName'));
    }
  }

  let newStatisticsTarget: number;
  if (params.resetToDefault) {
    if (params.newStatisticsTarget) {
      throw new OperationOutcomeError(badRequest('Cannot specify newStatisticsTarget when resetToDefault is true'));
    }
    newStatisticsTarget = -1;
  } else {
    if (!params.newStatisticsTarget) {
      throw new OperationOutcomeError(badRequest('Missing newStatisticsTarget'));
    }

    if (params.newStatisticsTarget < 100 || params.newStatisticsTarget > 10000) {
      throw new OperationOutcomeError(badRequest('newStatisticsTarget must be between 100 and 10000'));
    }

    newStatisticsTarget = params.newStatisticsTarget;
  }

  await withPoolClient(async (client) => {
    await client.query('BEGIN');
    try {
      for (const columnName of params.columnNames) {
        // table and column names cannot be parameterized, so string interpolate after validating inputs
        await client.query(
          `ALTER TABLE "${params.tableName}" ALTER COLUMN "${columnName}" SET STATISTICS ${newStatisticsTarget}`
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      // suppress ROLLBACK errors so the original error propagates; withPoolClient
      // discards the client regardless
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    }
  }, getDatabasePool(DatabaseMode.WRITER)); // shardId will be an input to this route

  return [allOk];
}
