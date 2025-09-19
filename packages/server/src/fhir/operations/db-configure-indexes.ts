// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { accepted, badRequest, concatUrls, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { escapeIdentifier, Pool, PoolClient } from 'pg';
import { requireSuperAdmin } from '../../admin/super';
import { getConfig } from '../../config/loader';
import { DatabaseMode } from '../../database';
import { withLongRunningDatabaseClient } from '../../migrations/migration-utils';
import { getSystemRepo } from '../repo';
import { isValidTableName } from '../sql';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-configure-indexes',
  status: 'active',
  kind: 'operation',
  code: 'db-configure-indexes',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'tableName',
      type: 'string',
      min: 0,
      max: '*',
    },
    {
      use: 'in',
      name: 'fastUpdateAction',
      type: 'string',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'fastUpdateValue',
      type: 'boolean',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'ginPendingListLimitAction',
      type: 'string',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'ginPendingListLimitValue',
      type: 'integer',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'action',
      min: 0,
      max: '*',
      part: [
        { use: 'out', name: 'sql', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'durationMs', type: 'integer', min: 0, max: '1' },
      ],
    },
  ],
};

type InputParameters = {
  tableName?: string[];
  fastUpdateAction?: 'set' | 'reset';
  fastUpdateValue?: boolean;
  ginPendingListLimitAction?: 'set' | 'reset';
  ginPendingListLimitValue?: number;
};

type OutputAction = {
  sql: string;
  durationMs?: number;
};

export async function dbConfigureIndexesHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();
  if (req.headers?.['prefer'] !== 'respond-async') {
    throw new OperationOutcomeError(badRequest('Operation requires "Prefer: respond-async"'));
  }

  const params = parseInputParameters<InputParameters>(operation, req);
  const config: GinIndexConfig = {};

  let tableNames: string[];
  if (params.tableName && params.tableName.length > 0) {
    for (const table of params.tableName) {
      if (!isValidTableName(table)) {
        throw new OperationOutcomeError(badRequest('Invalid tableName'));
      }
    }
    tableNames = params.tableName;
  } else {
    throw new OperationOutcomeError(badRequest('tableName must be specified'));
  }

  if (params.fastUpdateAction === 'reset') {
    config.fastUpdate = 'reset';
  } else if (params.fastUpdateAction === 'set') {
    if (typeof params.fastUpdateValue !== 'boolean') {
      throw new OperationOutcomeError(badRequest('fastUpdateValue must be a boolean'));
    }
    config.fastUpdate = params.fastUpdateValue;
  }

  if (params.ginPendingListLimitAction === 'reset') {
    config.ginPendingListLimit = 'reset';
  } else if (params.ginPendingListLimitAction === 'set') {
    if (!Number.isInteger(params.ginPendingListLimitValue)) {
      throw new OperationOutcomeError(badRequest('ginPendingListLimitValue must be an integer'));
    }
    config.ginPendingListLimit = params.ginPendingListLimitValue;
  }

  if (config.fastUpdate === undefined && config.ginPendingListLimit === undefined) {
    throw new OperationOutcomeError(
      badRequest('At least one of fastUpdateAction or ginPendingListLimitAction must be specified')
    );
  }

  const systemRepo = getSystemRepo();
  const { baseUrl } = getConfig();
  const exec = new AsyncJobExecutor(systemRepo);
  await exec.init(concatUrls(baseUrl, 'fhir/R4' + req.url));
  exec.start(async () => {
    const action: OutputAction[] = [];
    await withLongRunningDatabaseClient(async (client) => {
      await configureGinIndexes(client, action, tableNames, config);

      // Vacuum if the fastupdate is disabled to flush GIN pending lists
      if (config.fastUpdate === false) {
        for (const tableName of tableNames) {
          await vacuumTable(client, action, tableName);
        }
      }
    }, DatabaseMode.WRITER);
    return buildOutputParameters(operation, { action });
  });
  return [accepted(exec.getContentLocation(baseUrl))];
}

type GinIndexConfig = {
  fastUpdate?: 'reset' | true | false;
  ginPendingListLimit?: 'reset' | number;
};

async function configureGinIndexes(
  client: PoolClient | Pool,
  actions: OutputAction[],
  tableNames: string[],
  config: GinIndexConfig
): Promise<void> {
  const resetStrings: string[] = [];
  const setStrings: string[] = [];
  let resetSql = '';
  let setSql = '';

  if (config.fastUpdate === 'reset') {
    resetStrings.push('fastupdate');
  } else if (typeof config.fastUpdate === 'boolean') {
    setStrings.push(`fastupdate = ${config.fastUpdate}`);
  }

  if (config.ginPendingListLimit === 'reset') {
    resetStrings.push('gin_pending_list_limit');
  } else if (typeof config.ginPendingListLimit === 'number') {
    setStrings.push(`gin_pending_list_limit = ${config.ginPendingListLimit}`);
  }

  if (resetStrings.length > 0) {
    resetSql = `SELECT format('ALTER INDEX %I.%I RESET (${resetStrings.join(', ')})', idx.schemaname, idx.indexname) INTO reset_sql;
      EXECUTE reset_sql;`;
  }

  if (setStrings.length > 0) {
    setSql = `SELECT format('ALTER INDEX %I.%I SET (${setStrings.join(', ')})', idx.schemaname, idx.indexname) INTO set_sql;
      EXECUTE set_sql;`;
  }

  const doSql = `
    DO $$
    DECLARE
      idx RECORD;
      reset_sql TEXT;
      set_sql TEXT;
    BEGIN
      CREATE TEMP TABLE configure_index_actions (
          "schemaName" TEXT,
          "tableName" TEXT,
          "indexName" TEXT,
          "resetSql" TEXT,
          "setSql" TEXT
      );
      FOR idx IN 
        SELECT n.nspname schemaname, t.relname tablename, i.relname indexname
        FROM pg_index ix
        JOIN pg_class i ON ix.indexrelid = i.oid
        JOIN pg_class t ON ix.indrelid = t.oid
        JOIN pg_namespace AS n ON n.oid = t.relnamespace
        JOIN pg_am a ON i.relam = a.oid
        WHERE a.amname = 'gin'
        AND n.nspname = 'public'
        AND t.relname IN (${tableNames.map((name) => `'${name}'`).join(', ')})
      LOOP
        ${resetSql}
        ${setSql}
        INSERT INTO configure_index_actions VALUES (
          idx.schemaname,
          idx.tablename,
          idx.indexname,
          reset_sql,
          set_sql
        );
      END LOOP;
    END $$`;

  await client.query(doSql);
  const configureActions = await client.query<{
    schemaName: string;
    tableName: string;
    indexName: string;
    resetSql?: string;
    setSql?: string;
  }>(`SELECT * FROM configure_index_actions`);
  await client.query(`DROP TABLE configure_index_actions`);

  for (const action of configureActions.rows) {
    if (action.resetSql) {
      actions.push({ sql: action.resetSql });
    }
    if (action.setSql) {
      actions.push({ sql: action.setSql });
    }
  }
}

async function vacuumTable(client: PoolClient | Pool, actions: OutputAction[], tableName: string): Promise<void> {
  const sql = `VACUUM ${escapeIdentifier(tableName)}`;
  const startTime = Date.now();
  await client.query(sql);
  actions.push({ sql, durationMs: Date.now() - startTime });
}
