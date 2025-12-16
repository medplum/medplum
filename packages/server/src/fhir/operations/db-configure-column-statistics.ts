// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getSystemRepo } from '../repo';
import { isValidColumnName, isValidTableName } from '../sql';
import { parseInputParameters } from './utils/parameters';

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
    {
      use: 'in',
      name: 'tableName',
      type: 'string',
      min: 1,
      max: '1',
    },
    {
      use: 'in',
      name: 'columnNames',
      type: 'string',
      min: 1,
      max: '*',
    },
    {
      use: 'in',
      name: 'resetToDefault',
      type: 'boolean',
      min: 1,
      max: '1',
    },
    {
      use: 'in',
      name: 'newStatisticsTarget',
      type: 'integer',
      min: 0,
      max: '1',
    },
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

  const systemRepo = getSystemRepo();
  await systemRepo.withTransaction(async (client) => {
    for (const columnName of params.columnNames) {
      await client.query(
        'ALTER TABLE "' + params.tableName + '" ALTER COLUMN "' + columnName + '" SET STATISTICS ' + newStatisticsTarget
      );
    }
  });

  return [allOk];
}
