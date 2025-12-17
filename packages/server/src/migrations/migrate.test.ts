// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { FileBuilder } from '@medplum/core';
import { escapeIdentifier } from 'pg';
import { loadTestConfig } from '../config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import {
  buildCreateTables,
  buildSchema,
  columnDefinitionsEqual,
  executeMigrationActions,
  generateMigrationActions,
  getCreateTableQueries,
  indexStructureDefinitionsAndSearchParameters,
  parseIndexName,
  writeActionsToBuilder,
} from './migrate';
import * as fns from './migrate-functions';
import type { ColumnDefinition, MigrationAction, MigrationActionResult, SchemaDefinition, TableDefinition } from './types';

describe('Generator', () => {
  let consoleLogSpy: jest.SpyInstance;
  beforeAll(async () => {
    indexStructureDefinitionsAndSearchParameters();

    const config = await loadTestConfig();
    await initDatabase(config);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(async () => {
    consoleLogSpy.mockRestore();
    await closeDatabase();
  });

  describe('buildSchema', () => {
    test('generates schema without errors', () => {
      const schemaBuilder = new FileBuilder();
      buildSchema(schemaBuilder);
      expect(() => schemaBuilder.toString()).not.toThrow();
    });
  });

  describe('generateMigrationActions', () => {
    test('generates migration without errors', async () => {
      await expect(() =>
        generateMigrationActions({
          dbClient: getDatabasePool(DatabaseMode.WRITER),
          skipPostDeployActions: false,
          allowPostDeployActions: true,
          dropUnmatchedIndexes: false,
          analyzeResourceTables: true,
        })
      ).resolves.not.toThrow();
    });

    test('with skipPostDeployActions', async () => {
      await expect(() =>
        generateMigrationActions({
          dbClient: getDatabasePool(DatabaseMode.WRITER),
          skipPostDeployActions: true,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('buildCreateTables', () => {
    test('Patient', () => {
      const result: SchemaDefinition = { tables: [], functions: [] };
      buildCreateTables(result, 'Patient');
      expect(result.tables.map((t) => t.name)).toStrictEqual(['Patient', 'Patient_History', 'Patient_References']);

      const table = result.tables.find((t) => t.name === 'Patient') as TableDefinition;
      expect(table).toBeDefined();

      const tokenCodes = [
        '_compartmentIdentifier',
        '_security',
        '_tag',
        'email',
        'generalPractitionerIdentifier',
        'identifier',
        'language',
        'linkIdentifier',
        'organizationIdentifier',
        'phone',
        'telecom',
      ];

      const sharedTokenCodes = [
        '_compartmentIdentifier',
        '_security',
        'generalPractitionerIdentifier',
        'linkIdentifier',
        'organizationIdentifier',
      ];

      const expectedColumns: ColumnDefinition[] = [
        {
          name: 'id',
          type: 'UUID',
          primaryKey: true,
          notNull: true,
        },
        {
          name: 'content',
          type: 'TEXT',
          notNull: true,
        },
        {
          name: 'lastUpdated',
          type: 'TIMESTAMPTZ',
          notNull: true,
        },
        {
          name: 'deleted',
          type: 'BOOLEAN',
          notNull: true,
          defaultValue: 'false',
        },
        {
          name: 'compartments',
          type: 'UUID[]',
          notNull: true,
        },
        {
          name: 'projectId',
          type: 'UUID',
          notNull: true,
        },
        {
          name: '__version',
          type: 'INTEGER',
          notNull: true,
        },
        {
          name: '_source',
          type: 'TEXT',
        },
        {
          name: '_profile',
          type: 'TEXT[]',
        },
        {
          name: 'active',
          type: 'BOOLEAN',
          notNull: false,
        },
        {
          name: 'birthdate',
          type: 'DATE',
          notNull: false,
        },
        {
          name: 'deathDate',
          type: 'TIMESTAMPTZ',
          notNull: false,
        },
        {
          name: 'deceased',
          type: 'BOOLEAN',
          notNull: false,
        },
        {
          name: 'gender',
          type: 'TEXT',
          notNull: false,
        },
        {
          name: 'generalPractitioner',
          type: 'TEXT[]',
          notNull: false,
        },
        {
          name: 'link',
          type: 'TEXT[]',
          notNull: false,
        },
        {
          name: 'organization',
          type: 'TEXT',
          notNull: false,
        },
        {
          name: 'phonetic',
          type: 'TEXT[]',
          notNull: false,
        },
        {
          name: 'ethnicity',
          type: 'TEXT[]',
          notNull: false,
        },
        {
          name: 'genderIdentity',
          type: 'TEXT[]',
          notNull: false,
        },
        {
          name: 'race',
          type: 'TEXT[]',
          notNull: false,
        },
        {
          name: '__sharedTokens',
          type: 'UUID[]',
        },
        {
          name: '__sharedTokensText',
          type: 'TEXT[]',
        },
        {
          name: '__familySort',
          type: 'TEXT',
        },
        {
          name: '__givenSort',
          type: 'TEXT',
        },
        {
          name: '__nameSort',
          type: 'TEXT',
        },
        ...tokenCodes.flatMap((code) => {
          // both dedicated and shared tokens have a sort column
          const expectedCols = [
            {
              name: `__${code}Sort`,
              type: 'TEXT',
            },
          ];

          // add dedicated columns
          if (!sharedTokenCodes.includes(code)) {
            expectedCols.push(
              {
                name: `__${code}`,
                type: 'UUID[]',
              },
              {
                name: `__${code}Text`,
                type: 'TEXT[]',
              }
            );
          }

          return expectedCols;
        }),
      ];

      const sortFn = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);
      const actual: ColumnDefinition[] = toSorted(table.columns, sortFn);
      const expected = toSorted(expectedColumns, sortFn);
      expect(actual.map((c) => c.name)).toStrictEqual(expected.map((c) => c.name));
      for (let i = 0; i < actual.length; i++) {
        expect(columnDefinitionsEqual(table, actual[i], expected[i])).toBe(true);
      }
    });

    describe('identity columns', () => {
      test('create table', () => {
        const tableDef: TableDefinition = {
          name: 'IdentityColumns',
          columns: [
            {
              name: 'id',
              type: 'BIGINT',
              primaryKey: true,
              identity: 'ALWAYS',
            },
            {
              name: 'byDefaultId',
              type: 'BIGINT',
              primaryKey: true,
              identity: 'BY DEFAULT',
            },
          ],
          indexes: [],
        };
        const queries = getCreateTableQueries(tableDef, { includeIfExists: false });
        expect(queries).toStrictEqual([
          [
            'CREATE TABLE "IdentityColumns" (',
            '  "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,',
            '  "byDefaultId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY',
            ')',
          ].join('\n'),
        ]);
      });

      test('identity column with defaultValue', () => {
        const tableDef: TableDefinition = {
          name: 'IdentityColumns',
          columns: [
            {
              name: 'id',
              type: 'BIGINT',
              primaryKey: true,
              identity: 'ALWAYS',
              defaultValue: `nextval('${escapeIdentifier('IdentityColumns_id_seq')}::regclass)`,
            },
          ],
          indexes: [],
        };
        expect(() => getCreateTableQueries(tableDef, { includeIfExists: false })).toThrow(
          'Cannot set default value on identity column IdentityColumns.id'
        );
      });
    });
  });

  describe('parseIndexName', () => {
    test('parse index name with quotes', () => {
      const indexdef = 'CREATE INDEX "Account_Token_code_idx" ON "Account_Token" USING btree (code)';
      const indexName = parseIndexName(indexdef);
      expect(indexName).toBe('Account_Token_code_idx');
    });

    test('parse index name without quotes', () => {
      const indexdef = 'CREATE INDEX account_token_code_idx ON account_token USING btree (code)';
      const indexName = parseIndexName(indexdef);
      expect(indexName).toBe('account_token_code_idx');
    });
  });

});

function toSorted<T>(array: T[], sortFn: (a: T, b: T) => number): T[] {
  const newArray = Array.from(array);
  newArray.sort(sortFn);
  return newArray;
}

// Shared test fixtures for migration action tests
const testTableDef: TableDefinition = {
  name: 'TestTable',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true, notNull: true },
    { name: 'name', type: 'TEXT' },
  ],
  indexes: [{ columns: ['name'], indexType: 'btree' }],
};

type MigrationActionTestCase = {
  name: string;
  action: MigrationAction;
  builderExpected: string | string[];
  executionCheck: (mocks: {
    mockQuery: jest.SpyInstance;
    mockAnalyzeTable: jest.SpyInstance;
    mockIdempotentCreateIndex: jest.SpyInstance;
    mockNonBlockingAlterColumnNotNull: jest.SpyInstance;
    mockNonBlockingAddCheckConstraint: jest.SpyInstance;
    mockClient: { query: jest.Mock };
    results: MigrationActionResult[];
  }) => void;
};

const migrationActionTestCases: MigrationActionTestCase[] = [
  {
    name: 'ANALYZE_TABLE',
    action: { type: 'ANALYZE_TABLE', tableName: 'Patient' },
    builderExpected: "await fns.analyzeTable(client, results, 'Patient');",
    executionCheck: ({ mockAnalyzeTable, mockClient, results }) => {
      expect(mockAnalyzeTable).toHaveBeenCalledWith(mockClient, results, 'Patient');
    },
  },
  {
    name: 'CREATE_FUNCTION',
    action: {
      type: 'CREATE_FUNCTION',
      name: 'my_func',
      createQuery: 'CREATE FUNCTION my_func() RETURNS void AS $$ $$ LANGUAGE sql',
    },
    builderExpected:
      'await fns.query(client, results, `CREATE FUNCTION my_func() RETURNS void AS $$ $$ LANGUAGE sql`);',
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(
        mockClient,
        results,
        'CREATE FUNCTION my_func() RETURNS void AS $$ $$ LANGUAGE sql'
      );
    },
  },
  {
    name: 'CREATE_TABLE',
    action: { type: 'CREATE_TABLE', definition: testTableDef },
    builderExpected: [
      'CREATE TABLE IF NOT EXISTS "TestTable"',
      '"id" UUID PRIMARY KEY',
      '"name" TEXT',
      'CREATE INDEX IF NOT EXISTS "TestTable_name_idx"',
    ],
    executionCheck: ({ mockQuery }) => {
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][2]).toContain('CREATE TABLE IF NOT EXISTS "TestTable"');
      expect(mockQuery.mock.calls[1][2]).toContain('CREATE INDEX IF NOT EXISTS "TestTable_name_idx"');
    },
  },
  {
    name: 'DROP_TABLE',
    action: { type: 'DROP_TABLE', tableName: 'OldTable' },
    builderExpected: 'DROP TABLE IF EXISTS "OldTable"',
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(mockClient, results, 'DROP TABLE IF EXISTS "OldTable"');
    },
  },
  {
    name: 'ADD_COLUMN',
    action: {
      type: 'ADD_COLUMN',
      tableName: 'Patient',
      columnDefinition: { name: 'newCol', type: 'TEXT', notNull: true, defaultValue: "'default'" },
    },
    builderExpected: [
      'ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "newCol" TEXT NOT NULL',
      "DEFAULT 'default'",
    ],
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(
        mockClient,
        results,
        expect.stringContaining('ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "newCol" TEXT NOT NULL')
      );
    },
  },
  {
    name: 'DROP_COLUMN',
    action: { type: 'DROP_COLUMN', tableName: 'Patient', columnName: 'oldCol' },
    builderExpected: 'ALTER TABLE IF EXISTS "Patient" DROP COLUMN IF EXISTS "oldCol"',
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(
        mockClient,
        results,
        'ALTER TABLE IF EXISTS "Patient" DROP COLUMN IF EXISTS "oldCol"'
      );
    },
  },
  {
    name: 'ALTER_COLUMN_SET_DEFAULT',
    action: { type: 'ALTER_COLUMN_SET_DEFAULT', tableName: 'Patient', columnName: 'status', defaultValue: "'active'" },
    builderExpected: 'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "status" SET DEFAULT \'active\'',
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(
        mockClient,
        results,
        'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "status" SET DEFAULT \'active\''
      );
    },
  },
  {
    name: 'ALTER_COLUMN_DROP_DEFAULT',
    action: { type: 'ALTER_COLUMN_DROP_DEFAULT', tableName: 'Patient', columnName: 'status' },
    builderExpected: 'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "status" DROP DEFAULT',
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(
        mockClient,
        results,
        'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "status" DROP DEFAULT'
      );
    },
  },
  {
    name: 'ALTER_COLUMN_UPDATE_NOT_NULL (true)',
    action: { type: 'ALTER_COLUMN_UPDATE_NOT_NULL', tableName: 'Patient', columnName: 'name', notNull: true },
    builderExpected: 'await fns.nonBlockingAlterColumnNotNull(client, results, `Patient`, `name`);',
    executionCheck: ({ mockNonBlockingAlterColumnNotNull, mockQuery, mockClient, results }) => {
      expect(mockNonBlockingAlterColumnNotNull).toHaveBeenCalledWith(mockClient, results, 'Patient', 'name');
      expect(mockQuery).not.toHaveBeenCalled();
    },
  },
  {
    name: 'ALTER_COLUMN_UPDATE_NOT_NULL (false)',
    action: { type: 'ALTER_COLUMN_UPDATE_NOT_NULL', tableName: 'Patient', columnName: 'name', notNull: false },
    builderExpected: 'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "name" DROP NOT NULL',
    executionCheck: ({ mockQuery, mockNonBlockingAlterColumnNotNull, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(
        mockClient,
        results,
        'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "name" DROP NOT NULL'
      );
      expect(mockNonBlockingAlterColumnNotNull).not.toHaveBeenCalled();
    },
  },
  {
    name: 'ALTER_COLUMN_TYPE',
    action: { type: 'ALTER_COLUMN_TYPE', tableName: 'Patient', columnName: 'age', columnType: 'INTEGER' },
    builderExpected: 'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "age" TYPE INTEGER',
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(
        mockClient,
        results,
        'ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "age" TYPE INTEGER'
      );
    },
  },
  {
    name: 'CREATE_INDEX',
    action: {
      type: 'CREATE_INDEX',
      indexName: 'Patient_name_idx',
      createIndexSql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_name_idx" ON "Patient" ("name")',
    },
    builderExpected:
      'await fns.idempotentCreateIndex(client, results, \'Patient_name_idx\', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_name_idx" ON "Patient" ("name")`);',
    executionCheck: ({ mockIdempotentCreateIndex, mockClient, results }) => {
      expect(mockIdempotentCreateIndex).toHaveBeenCalledWith(
        mockClient,
        results,
        'Patient_name_idx',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_name_idx" ON "Patient" ("name")'
      );
    },
  },
  {
    name: 'DROP_INDEX',
    action: { type: 'DROP_INDEX', indexName: 'old_index' },
    builderExpected: 'DROP INDEX CONCURRENTLY IF EXISTS "old_index"',
    executionCheck: ({ mockQuery, mockClient, results }) => {
      expect(mockQuery).toHaveBeenCalledWith(mockClient, results, 'DROP INDEX CONCURRENTLY IF EXISTS "old_index"');
    },
  },
  {
    name: 'ADD_CONSTRAINT',
    action: {
      type: 'ADD_CONSTRAINT',
      tableName: 'Project',
      constraintName: 'check_id',
      constraintExpression: "id <> '00000000-0000-0000-0000-000000000000'::uuid",
    },
    builderExpected:
      "await fns.nonBlockingAddConstraint(client, results, 'Project', 'check_id', `id <> '00000000-0000-0000-0000-000000000000'::uuid`);",
    executionCheck: ({ mockNonBlockingAddCheckConstraint, mockClient, results }) => {
      expect(mockNonBlockingAddCheckConstraint).toHaveBeenCalledWith(
        mockClient,
        results,
        'Project',
        'check_id',
        "id <> '00000000-0000-0000-0000-000000000000'::uuid"
      );
    },
  },
];

describe('writeActionsToBuilder and executeMigrationActions', () => {
  let mockClient: { query: jest.Mock };
  let mockQuery: jest.SpyInstance;
  let mockAnalyzeTable: jest.SpyInstance;
  let mockIdempotentCreateIndex: jest.SpyInstance;
  let mockNonBlockingAlterColumnNotNull: jest.SpyInstance;
  let mockNonBlockingAddCheckConstraint: jest.SpyInstance;

  beforeEach(() => {
    mockClient = { query: jest.fn() };
    mockQuery = jest.spyOn(fns, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as any);
    mockAnalyzeTable = jest.spyOn(fns, 'analyzeTable').mockResolvedValue(undefined);
    mockIdempotentCreateIndex = jest.spyOn(fns, 'idempotentCreateIndex').mockResolvedValue(undefined);
    mockNonBlockingAlterColumnNotNull = jest.spyOn(fns, 'nonBlockingAlterColumnNotNull').mockResolvedValue(undefined);
    mockNonBlockingAddCheckConstraint = jest.spyOn(fns, 'nonBlockingAddCheckConstraint').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('writeActionsToBuilder generates boilerplate', () => {
    const builder = new FileBuilder();
    writeActionsToBuilder(builder, []);
    const output = builder.toString();
    expect(output).toContain("import type { PoolClient } from 'pg';");
    expect(output).toContain("import * as fns from '../migrate-functions';");
    expect(output).toContain('export async function run(client: PoolClient): Promise<void>');
    expect(output).toContain('const results: { name: string; durationMs: number }[] = []');
  });

  test.each(migrationActionTestCases)('$name action', async ({ action, builderExpected, executionCheck }) => {
    // Test writeActionsToBuilder
    const builder = new FileBuilder();
    writeActionsToBuilder(builder, [action]);
    const output = builder.toString();
    const expectedStrings = Array.isArray(builderExpected) ? builderExpected : [builderExpected];
    for (const expected of expectedStrings) {
      expect(output).toContain(expected);
    }

    // Test executeMigrationActions
    const results: MigrationActionResult[] = [];
    await executeMigrationActions(mockClient as any, results, [action]);
    executionCheck({
      mockQuery,
      mockAnalyzeTable,
      mockIdempotentCreateIndex,
      mockNonBlockingAlterColumnNotNull,
      mockNonBlockingAddCheckConstraint,
      mockClient,
      results,
    });
  });
});
