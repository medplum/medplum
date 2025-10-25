// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { escapeIdentifier } from 'pg';
import {
  buildCreateTables,
  columnDefinitionsEqual,
  getCreateTableQueries,
  indexStructureDefinitionsAndSearchParameters,
  parseIndexName,
} from './migrate';
import type { ColumnDefinition, SchemaDefinition, TableDefinition } from './types';

describe('Generator', () => {
  describe('buildCreateTables', () => {
    beforeAll(() => {
      indexStructureDefinitionsAndSearchParameters();
    });

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
