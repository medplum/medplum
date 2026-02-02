// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getShardSystemRepo } from '../repo';
import { PLACEHOLDER_SHARD_ID } from '../sharding';
import { isValidColumnName, isValidTableName } from '../sql';
import { makeOperationDefinitionParameter as param, parseInputParameters } from './utils/parameters';

const UpdateOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-configure-column-statistics',
  status: 'active',
  kind: 'operation',
  code: 'db-configure-column-statistics',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    param('in', 'tableName', 'string', 1, '1'),
    param('in', 'columnNames', 'string', 1, '*'),
    param('in', 'resetToDefault', 'boolean', 1, '1'),
    param('in', 'newStatisticsTarget', 'integer', 0, '1'),
  ],
};

export async function configureColumnStatisticsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();
  const params = parseInputParameters<{
    tableName: string;
    columnNames: string[];
    resetToDefault: boolean;
    newStatisticsTarget?: number;
  }>(UpdateOperation, req);

  if (!isValidTableName(params.tableName)) {
    throw new OperationOutcomeError(badRequest('Invalid tableName'));
  }

  for (const columnName of params.columnNames) {
    if (!isValidColumnName(columnName)) {
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

  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be an input to this handler
  await systemRepo.withTransaction(async (client) => {
    for (const columnName of params.columnNames) {
      await client.query(
        'ALTER TABLE "' + params.tableName + '" ALTER COLUMN "' + columnName + '" SET STATISTICS ' + newStatisticsTarget
      );
    }
  });

  return [allOk];
}
