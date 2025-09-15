// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { isValidTableName, replaceNullWithUndefinedInRows } from '../sql';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-gin-index-configure',
  status: 'active',
  kind: 'operation',
  code: 'db-gin-index-configure',
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
      name: 'fastUpdate',
      type: 'boolean',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'ginPendingListLimit',
      type: 'integer',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'result',
      min: 0,
      max: '*',
      part: [
        { use: 'out', name: 'tableName', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'indexName', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'pagesCleaned', type: 'string', min: 0, max: '1' },
      ],
    },
  ],
};

interface GinIndexInfo {
  schemaName: string;
  tableName: string;
  indexName: string;
  pagesCleaned?: number;
}

type InputParameters = {
  tableName?: string[];
  fastUpdate?: boolean;
  ginPendingListLimit?: number;
};

export async function dbGinIndexeConfigureHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<InputParameters>(operation, req);
  if (params.fastUpdate === undefined && params.ginPendingListLimit === undefined) {
    throw new OperationOutcomeError(badRequest('fastUpdate or ginPendingListLimit must be specified'));
  }

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

  const client = getDatabasePool(DatabaseMode.WRITER);

  const result = await configureGinIndexes(client, tableNames, params);
  const output: { result: GinIndexInfo[] } = { result };

  return [allOk, buildOutputParameters(operation, output)];
}

async function configureGinIndexes(
  client: PoolClient | Pool,
  tableNames: string[],
  config: { fastUpdate?: boolean; ginPendingListLimit?: number }
): Promise<GinIndexInfo[]> {
  const setStrings: string[] = [];
  if (config.fastUpdate !== undefined) {
    setStrings.push(`fastupdate = ${config.fastUpdate}`);
  }
  if (config.ginPendingListLimit !== undefined) {
    setStrings.push(`gin_pending_list_limit = ${config.ginPendingListLimit}`);
  }

  let cleanListSql = '';
  if (config.fastUpdate === false) {
    cleanListSql = `
      EXECUTE format('SELECT gin_clean_pending_list(%L::regclass)',
          quote_ident(idx.schemaname) || '.' || quote_ident(idx.indexname))
        INTO pages_cleaned;
    `;
  }

  const doSql = `
    DO $$
    DECLARE
      idx RECORD;
      pages_cleaned BIGINT;
    BEGIN
      CREATE TEMP TABLE gin_cleanup_results (
          "schemaName" TEXT,
          "tableName" TEXT,
          "indexName" TEXT,
          "pagesCleaned" BIGINT
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
        EXECUTE format('ALTER INDEX %I.%I SET (${setStrings.join(', ')})',
          idx.schemaname, 
          idx.indexname);
        ${cleanListSql}
        INSERT INTO gin_cleanup_results VALUES (
          idx.schemaname,
          idx.tablename,
          idx.indexname,
          pages_cleaned
        );
      END LOOP;
    END $$`;

  await client.query(doSql);
  const results = await client.query(`SELECT * FROM gin_cleanup_results`);
  replaceNullWithUndefinedInRows(results.rows);
  await client.query(`DROP TABLE gin_cleanup_results`);
  return results.rows;
}
