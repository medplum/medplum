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
  writePostDeployActionsToBuilder,
} from './migrate';
import * as fns from './migrate-functions';
import type {
  ColumnDefinition,
  MigrationAction,
  MigrationActionResult,
  SchemaDefinition,
  TableDefinition,
} from './types';

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
          dropUnmatchedIndexes: false,
          analyzeResourceTables: true,
        })
      ).resolves.not.toThrow();
    });

    test('returns separated pre and post deploy actions', async () => {
      const result = await generateMigrationActions({
        dbClient: getDatabasePool(DatabaseMode.WRITER),
      });
      expect(result).toHaveProperty('preDeployActions');
      expect(result).toHaveProperty('postDeployActions');
      expect(result).toHaveProperty('postDeployDescriptions');
      expect(Array.isArray(result.preDeployActions)).toBe(true);
      expect(Array.isArray(result.postDeployActions)).toBe(true);
      expect(Array.isArray(result.postDeployDescriptions)).toBe(true);
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

describe('writePostDeployActionsToBuilder', () => {
  test('generates CustomPostDeployMigration boilerplate', () => {
    const builder = new FileBuilder();
    writePostDeployActionsToBuilder(builder, []);
    const output = builder.toString();
    expect(output).toContain('// Generated by @medplum/generator');
    expect(output).toContain("import type { PoolClient } from 'pg';");
    expect(output).toContain("import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';");
    expect(output).toContain("import * as fns from '../migrate-functions';");
    expect(output).toContain('export const migration: CustomPostDeployMigration');
    expect(output).toContain("type: 'custom'");
    expect(output).toContain('async function callback(client: PoolClient, results: MigrationActionResult[])');
  });

  test('CREATE_INDEX action', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = {
      type: 'CREATE_INDEX',
      indexName: 'Patient_name_idx',
      createIndexSql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_name_idx" ON "Patient" ("name")',
    };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain("await fns.idempotentCreateIndex(client, results, 'Patient_name_idx'");
    expect(output).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_name_idx"');
  });

  test('DROP_TABLE action', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = { type: 'DROP_TABLE', tableName: 'OldTable' };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain('await fns.query(client, results, `DROP TABLE IF EXISTS "OldTable"`);');
  });

  test('DROP_COLUMN action', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = { type: 'DROP_COLUMN', tableName: 'Patient', columnName: 'oldCol' };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain('await fns.query(client, results, `ALTER TABLE IF EXISTS "Patient" DROP COLUMN IF EXISTS "oldCol"`);');
  });

  test('ALTER_COLUMN_SET_DEFAULT action', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = {
      type: 'ALTER_COLUMN_SET_DEFAULT',
      tableName: 'Patient',
      columnName: 'status',
      defaultValue: "'active'",
    };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain('ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "status" SET DEFAULT');
  });

  test('ALTER_COLUMN_DROP_DEFAULT action', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = {
      type: 'ALTER_COLUMN_DROP_DEFAULT',
      tableName: 'Patient',
      columnName: 'status',
    };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain('ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "status" DROP DEFAULT');
  });

  test('ALTER_COLUMN_UPDATE_NOT_NULL action (true)', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = {
      type: 'ALTER_COLUMN_UPDATE_NOT_NULL',
      tableName: 'Patient',
      columnName: 'name',
      notNull: true,
    };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain('await fns.nonBlockingAlterColumnNotNull(client, results, `Patient`, `name`);');
  });

  test('ALTER_COLUMN_UPDATE_NOT_NULL action (false)', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = {
      type: 'ALTER_COLUMN_UPDATE_NOT_NULL',
      tableName: 'Patient',
      columnName: 'name',
      notNull: false,
    };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain('ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "name" DROP NOT NULL');
  });

  test('ALTER_COLUMN_TYPE action', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = {
      type: 'ALTER_COLUMN_TYPE',
      tableName: 'Patient',
      columnName: 'age',
      columnType: 'INTEGER',
    };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain('ALTER TABLE IF EXISTS "Patient" ALTER COLUMN "age" TYPE INTEGER');
  });

  test('ADD_CONSTRAINT action', () => {
    const builder = new FileBuilder();
    const action: MigrationAction = {
      type: 'ADD_CONSTRAINT',
      tableName: 'Project',
      constraintName: 'check_id',
      constraintExpression: "id <> '00000000-0000-0000-0000-000000000000'::uuid",
    };
    writePostDeployActionsToBuilder(builder, [action]);
    const output = builder.toString();
    expect(output).toContain("await fns.nonBlockingAddCheckConstraint(client, results, 'Project', 'check_id'");
  });
});

describe('getCreateTableQueries edge cases', () => {
  test('skips primary key index in index list', () => {
    const tableDef: TableDefinition = {
      name: 'TestTable',
      columns: [
        { name: 'id', type: 'UUID', primaryKey: true, notNull: true },
        { name: 'name', type: 'TEXT' },
      ],
      indexes: [
        { columns: ['id'], indexType: 'btree', primaryKey: true },
        { columns: ['name'], indexType: 'btree' },
      ],
    };
    const queries = getCreateTableQueries(tableDef, { includeIfExists: false });
    // Should have CREATE TABLE + 1 index (not 2, because primary key index is skipped)
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('CREATE TABLE "TestTable"');
    expect(queries[1]).toContain('CREATE INDEX');
    expect(queries[1]).toContain('TestTable_name_idx');
    // Should not have a separate index for the primary key
    expect(queries.join('\n')).not.toContain('TestTable_id_idx');
  });
});

describe('generateMigrationActions schema drift detection', () => {
  // Helper to create a mock DB client
  function createMockDbClient(options: {
    tableNames?: string[];
    columns?: Record<string, { attname: string; data_type: string; primary_key: boolean; attnotnull: boolean; default_value?: string }[]>;
    indexes?: Record<string, { indexdef: string }[]>;
    constraints?: Record<string, { conname: string; contype: string; convalidated: boolean; condef: string }[]>;
    missingFunctions?: string[];
  }): { query: jest.Mock } {
    const { tableNames = [], columns = {}, indexes = {}, constraints = {}, missingFunctions = [] } = options;

    return {
      query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
        // Table names query
        if (sql.includes('information_schema.tables')) {
          return { rows: tableNames.map((name) => ({ table_name: name })) };
        }

        // Columns query (pg_attribute)
        if (sql.includes('pg_attribute') && sql.includes('pg_class')) {
          const tableName = params?.[0] as string;
          return { rows: columns[tableName] ?? [] };
        }

        // Indexes query
        if (sql.includes('pg_indexes')) {
          const tableName = params?.[0] as string;
          return { rows: indexes[tableName] ?? [] };
        }

        // Constraints query
        if (sql.includes('pg_constraint')) {
          const tableName = (params?.[0] as string)?.replace(/"/g, '');
          return { rows: constraints[tableName] ?? [] };
        }

        // Function definition query
        if (sql.includes('pg_get_functiondef')) {
          const funcName = params?.[0] as string;
          if (missingFunctions.includes(funcName)) {
            const err = new Error(`function "${funcName}" does not exist`);
            throw err;
          }
          return { rows: [{ pg_get_functiondef: `CREATE FUNCTION ${funcName}() ...` }] };
        }

        return { rows: [] };
      }),
    };
  }

  test('detects missing function and generates CREATE_FUNCTION', async () => {
    const mockDb = createMockDbClient({
      tableNames: [],
      missingFunctions: ['token_array_to_text'],
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const createFunctionAction = result.preDeployActions.find((a) => a.type === 'CREATE_FUNCTION');
    expect(createFunctionAction).toBeDefined();
    expect(createFunctionAction?.type).toBe('CREATE_FUNCTION');
    if (createFunctionAction?.type === 'CREATE_FUNCTION') {
      expect(createFunctionAction.name).toBe('token_array_to_text');
    }
  });

  test('detects missing table and generates CREATE_TABLE', async () => {
    // Return empty table list - all expected tables will be "missing"
    const mockDb = createMockDbClient({
      tableNames: [],
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const createTableActions = result.preDeployActions.filter((a) => a.type === 'CREATE_TABLE');
    expect(createTableActions.length).toBeGreaterThan(0);
    // Should include Patient table (a known FHIR resource type)
    const patientCreate = createTableActions.find(
      (a) => a.type === 'CREATE_TABLE' && a.definition.name === 'Patient'
    );
    expect(patientCreate).toBeDefined();
  });

  test('detects extra table and generates DROP_TABLE as post-deploy', async () => {
    const mockDb = createMockDbClient({
      tableNames: ['ObsoleteTable'],
      columns: {
        ObsoleteTable: [{ attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true }],
      },
      indexes: { ObsoleteTable: [] },
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const dropTableAction = result.postDeployActions.find(
      (a) => a.type === 'DROP_TABLE' && a.tableName === 'ObsoleteTable'
    );
    expect(dropTableAction).toBeDefined();
    expect(result.postDeployDescriptions).toContainEqual(expect.stringContaining('DROP TABLE'));
  });

  test('detects extra column and generates DROP_COLUMN as post-deploy', async () => {
    const mockDb = createMockDbClient({
      tableNames: ['Patient'],
      columns: {
        Patient: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          { attname: 'content', data_type: 'text', primary_key: false, attnotnull: true },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'false' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
          { attname: 'obsoleteColumn', data_type: 'text', primary_key: false, attnotnull: false },
        ],
      },
      indexes: { Patient: [] },
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const dropColumnAction = result.postDeployActions.find(
      (a) => a.type === 'DROP_COLUMN' && a.tableName === 'Patient' && a.columnName === 'obsoleteColumn'
    );
    expect(dropColumnAction).toBeDefined();
    expect(result.postDeployDescriptions).toContainEqual(expect.stringContaining('Dropping column obsoleteColumn'));
  });

  test('detects column default value change and generates ALTER_COLUMN_SET_DEFAULT', async () => {
    const mockDb = createMockDbClient({
      tableNames: ['Patient'],
      columns: {
        Patient: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          { attname: 'content', data_type: 'text', primary_key: false, attnotnull: true },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          // deleted column has wrong default value (should be 'false')
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'true' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
        ],
      },
      indexes: { Patient: [] },
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const setDefaultAction = result.postDeployActions.find(
      (a) =>
        a.type === 'ALTER_COLUMN_SET_DEFAULT' &&
        a.tableName === 'Patient' &&
        a.columnName === 'deleted'
    );
    expect(setDefaultAction).toBeDefined();
  });

  test('detects column default value removal and generates ALTER_COLUMN_DROP_DEFAULT', async () => {
    const mockDb = createMockDbClient({
      tableNames: ['Patient'],
      columns: {
        Patient: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          { attname: 'content', data_type: 'text', primary_key: false, attnotnull: true },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'false' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
          // _source has a default but shouldn't
          { attname: '_source', data_type: 'text', primary_key: false, attnotnull: false, default_value: "'test'" },
        ],
      },
      indexes: { Patient: [] },
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const dropDefaultAction = result.postDeployActions.find(
      (a) =>
        a.type === 'ALTER_COLUMN_DROP_DEFAULT' &&
        a.tableName === 'Patient' &&
        a.columnName === '_source'
    );
    expect(dropDefaultAction).toBeDefined();
  });

  test('detects column NOT NULL change and generates ALTER_COLUMN_UPDATE_NOT_NULL', async () => {
    const mockDb = createMockDbClient({
      tableNames: ['Patient'],
      columns: {
        Patient: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          // content should be NOT NULL but isn't
          { attname: 'content', data_type: 'text', primary_key: false, attnotnull: false },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'false' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
        ],
      },
      indexes: { Patient: [] },
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const notNullAction = result.postDeployActions.find(
      (a) =>
        a.type === 'ALTER_COLUMN_UPDATE_NOT_NULL' &&
        a.tableName === 'Patient' &&
        a.columnName === 'content'
    );
    expect(notNullAction).toBeDefined();
    expect(notNullAction?.type === 'ALTER_COLUMN_UPDATE_NOT_NULL' && notNullAction.notNull).toBe(true);
  });

  test('detects column type change and generates ALTER_COLUMN_TYPE', async () => {
    const mockDb = createMockDbClient({
      tableNames: ['Patient'],
      columns: {
        Patient: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          // content has wrong type (should be TEXT)
          { attname: 'content', data_type: 'varchar', primary_key: false, attnotnull: true },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'false' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
        ],
      },
      indexes: { Patient: [] },
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const typeChangeAction = result.postDeployActions.find(
      (a) =>
        a.type === 'ALTER_COLUMN_TYPE' &&
        a.tableName === 'Patient' &&
        a.columnName === 'content'
    );
    expect(typeChangeAction).toBeDefined();
  });

  test('detects unmatched index and generates DROP_INDEX when dropUnmatchedIndexes is true', async () => {
    const mockDb = createMockDbClient({
      tableNames: ['Patient'],
      columns: {
        Patient: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          { attname: 'content', data_type: 'text', primary_key: false, attnotnull: true },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'false' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
        ],
      },
      indexes: {
        Patient: [
          { indexdef: 'CREATE INDEX "Patient_obsolete_idx" ON "Patient" USING btree (obsolete_column)' },
        ],
      },
    });

    const result = await generateMigrationActions({
      dbClient: mockDb as any,
      dropUnmatchedIndexes: true,
    });

    const dropIndexAction = result.preDeployActions.find(
      (a) => a.type === 'DROP_INDEX' && a.indexName === 'Patient_obsolete_idx'
    );
    expect(dropIndexAction).toBeDefined();
  });

  test('detects missing constraint and generates ADD_CONSTRAINT as post-deploy', async () => {
    // Project table has a constraint - provide it without the constraint
    const mockDb = createMockDbClient({
      tableNames: ['Project'],
      columns: {
        Project: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          { attname: 'content', data_type: 'text', primary_key: false, attnotnull: true },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'false' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
        ],
      },
      indexes: { Project: [] },
      constraints: { Project: [] }, // Missing constraint
    });

    const result = await generateMigrationActions({ dbClient: mockDb as any });

    const addConstraintAction = result.postDeployActions.find(
      (a) => a.type === 'ADD_CONSTRAINT' && a.tableName === 'Project'
    );
    expect(addConstraintAction).toBeDefined();
  });

  test('logs unmatched constraint that exists in DB but not in target', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const mockDb = createMockDbClient({
      tableNames: ['Patient'],
      columns: {
        Patient: [
          { attname: 'id', data_type: 'uuid', primary_key: true, attnotnull: true },
          { attname: 'content', data_type: 'text', primary_key: false, attnotnull: true },
          { attname: 'lastUpdated', data_type: 'timestamp with time zone', primary_key: false, attnotnull: true },
          { attname: 'deleted', data_type: 'boolean', primary_key: false, attnotnull: true, default_value: 'false' },
          { attname: 'compartments', data_type: 'uuid[]', primary_key: false, attnotnull: true },
          { attname: 'projectId', data_type: 'uuid', primary_key: false, attnotnull: true },
          { attname: '__version', data_type: 'integer', primary_key: false, attnotnull: true },
        ],
      },
      indexes: { Patient: [] },
      constraints: {
        Patient: [
          {
            conname: 'Patient_obsolete_check',
            contype: 'c',
            convalidated: true,
            condef: 'CHECK ((obsolete_col IS NOT NULL))',
          },
        ],
      },
    });

    await generateMigrationActions({ dbClient: mockDb as any });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Patient] Existing constraint should not exist:'),
      expect.anything()
    );

    logSpy.mockRestore();
  });
});
