import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { Client, Pool } from 'pg';
import { isValidTableName, requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { parseInputParameters } from './utils/parameters';

const LookupOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-column-statistics-lookup',
  status: 'active',
  kind: 'operation',
  code: 'lookup',
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
      max: '1',
    },
    {
      use: 'out',
      name: 'defaultStatisticsTarget',
      type: 'integer',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'table',
      part: [
        { use: 'out', name: 'tableName', type: 'string', min: 1, max: '1' },
        {
          use: 'out',
          name: 'column',
          min: 1,
          max: '*',
          part: [
            {
              use: 'out',
              name: 'columnName',
              type: 'string',
              min: 1,
              max: '1',
            },
            {
              use: 'out',
              name: 'statisticsTarget',
              type: 'string',
              min: 1,
              max: '1',
            },
            {
              use: 'out',
              name: 'nullFraction',
              type: 'decimal',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'avgWidth',
              type: 'integer',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'nDistinct',
              type: 'integer',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'mostCommonValues',
              type: 'string',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'mostCommonFreqs',
              type: 'string',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'histogramBounds',
              type: 'string',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'correlation',
              type: 'decimal',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'mostCommonElems',
              type: 'string',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'mostCommonElemFreqs',
              type: 'string',
              min: 0,
              max: '1',
            },
            {
              use: 'out',
              name: 'elemCountHistogram',
              type: 'string',
              min: 0,
              max: '1',
            },
          ],
        },
      ],
      min: 0,
      max: '1',
    },
  ],
};

export async function lookupDbColumnStatisticsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ tableName?: string }>(LookupOperation, req);

  const tableName = params.tableName;

  if (tableName && !isValidTableName(tableName)) {
    throw new OperationOutcomeError(badRequest('Invalid tableName'));
  }

  const defaultStatisticsTarget = await getDefaultStatisticsTarget();
  const client = getDatabasePool(DatabaseMode.WRITER);
  let columns: ColumnInfo[] | undefined;
  if (tableName) {
    columns = await getTableColumns(client, tableName);
  }

  return [allOk, buildOutput(defaultStatisticsTarget, columns)];
}

function buildOutput(defaultStatisticsTarget: number, columns: ColumnInfo[] | undefined): Parameters {
  const output: Parameters & { parameter: ParametersParameter[] } = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'defaultStatisticsTarget',
        valueInteger: defaultStatisticsTarget,
      },
    ],
  };

  if (columns && columns.length > 0) {
    output.parameter.push({
      name: 'table',
      part: columns.map((c) => {
        return {
          name: 'column',
          part: [
            {
              name: 'name',
              valueString: c.name,
            },
            {
              name: 'statisticsTarget',
              valueInteger: c.statisticsTarget,
            },
            {
              name: 'nullFraction',
              valueDecimal: c.nullFraction,
            },
            {
              name: 'avgWidth',
              valueInteger: c.avgWidth,
            },
            {
              name: 'nDistinct',
              valueInteger: c.nDistinct,
            },
            {
              name: 'mostCommonValues',
              valueString: c.mostCommonValues,
            },
            {
              name: 'mostCommonFreqs',
              valueString: c.mostCommonFreqs?.join(', '),
            },
            {
              name: 'histogramBounds',
              valueString: c.histogramBounds,
            },
            {
              name: 'correlation',
              valueDecimal: c.correlation,
            },
            {
              name: 'mostCommonElems',
              valueString: c.mostCommonElems,
            },
            {
              name: 'mostCommonElemFreqs',
              valueString: c.mostCommonElemFreqs?.join(', '),
            },
            {
              name: 'elemCountHistogram',
              valueString: c.elemCountHistogram?.join(', '),
            },
          ],
        };
      }),
    });
  }
  return output;
}

async function getDefaultStatisticsTarget(): Promise<number> {
  const client = getDatabasePool(DatabaseMode.WRITER);
  const defaultStatisticsTarget = await client.query('SELECT setting FROM pg_settings WHERE name = $1', [
    'default_statistics_target',
  ]);
  return Number(defaultStatisticsTarget.rows[0].setting);
}

interface ColumnInfo {
  schemaName: string;
  tableName: string;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | undefined;
  primaryKey: boolean;
  statisticsTarget: number;
  nullFraction: number | undefined;
  avgWidth: number | undefined;
  nDistinct: number | undefined;
  mostCommonValues: string | undefined;
  mostCommonFreqs: number[] | undefined;
  histogramBounds: string | undefined;
  correlation: number | undefined;
  mostCommonElems: string | undefined;
  mostCommonElemFreqs: number[] | undefined;
  elemCountHistogram: number[] | undefined;
}

async function getTableColumns(db: Client | Pool, tableName: string): Promise<ColumnInfo[]> {
  // https://stackoverflow.com/questions/8146448/get-the-default-values-of-table-columns-in-postgres
  const rs = await db.query(
    `
    SELECT
      n.nspname as "schemaName",
      c.relname as "tableName",
      a.attname as "name",
      a.attnotnull as "notNull",
      format_type(a.atttypid, a.atttypmod) as "type",
      COALESCE((SELECT indisprimary from pg_index where indrelid = a.attrelid AND attnum = any(indkey) and indisprimary = true), FALSE) as "primaryKey",
      pg_get_expr(d.adbin, d.adrelid) AS "defaultValue",
      a.attstattarget AS "statisticsTarget",
      s.null_frac AS "nullFraction",
      s.avg_width AS "avgWidth",
      s.n_distinct AS "nDistinct",
      s.most_common_vals AS "mostCommonValues",
      s.most_common_freqs AS "mostCommonFreqs",
      s.histogram_bounds AS "histogramBounds",
      s.correlation AS "correlation",
      s.most_common_elems AS "mostCommonElems",
      s.most_common_elem_freqs AS "mostCommonElemFreqs",
      s.elem_count_histogram AS "elemCountHistogram"
    FROM
      pg_attribute AS a
      JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
      LEFT JOIN pg_stats AS s ON s.attname = a.attname AND s.tablename = c.relname
    WHERE
      n.nspname = 'public'
      AND c.relname = $1
      AND attnum > 0
      AND NOT attisdropped
    ORDER BY attnum;
  `,
    [tableName]
  );

  const rows = rs.rows;
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (v === null) {
        row[k] = undefined;
      }
    }
  }

  return rows;
}
