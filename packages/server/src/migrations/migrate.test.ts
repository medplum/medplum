import { getDataType, InternalTypeSchema } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import {
  buildCreateTables,
  columnDefinitionsEqual,
  indexDefinitionsEqual,
  indexStructureDefinitionsAndSearchParameters,
  parseIndexDefinition,
  parseIndexName,
} from './migrate';
import { ColumnDefinition, IndexDefinition, SchemaDefinition, TableDefinition } from './types';

describe('Generator', () => {
  describe('buildCreateTables', () => {
    beforeAll(() => {
      indexStructureDefinitionsAndSearchParameters();
    });

    test('Patient', () => {
      const result: SchemaDefinition = { tables: [], functions: [] };
      const dataTypes: [ResourceType, InternalTypeSchema][] = [['Patient', getDataType('Patient')]];
      for (const [resourceType, typeSchema] of dataTypes) {
        buildCreateTables(result, resourceType, typeSchema);
      }
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
        },
        {
          name: '__version',
          type: 'INTEGER',
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
        expect(columnDefinitionsEqual(actual[i], expected[i])).toBe(true);
      }
    });
  });

  describe('parseIndexDefinition', () => {
    test('parse index', () => {
      const indexdef =
        'CREATE INDEX "DomainConfiguration_compartments_idx" ON public."DomainConfiguration" USING gin (compartments)';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = { columns: ['compartments'], indexType: 'gin', unique: false, indexdef };

      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse UNIQUE index', () => {
      const indexdef = 'CREATE UNIQUE INDEX "Coding_pkey" ON public."Coding" USING btree (id)';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = { columns: ['id'], indexType: 'btree', unique: true, indexdef };

      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse expressions', () => {
      const indexdef =
        'CREATE INDEX "Address_address_idx_tsv" ON public."Address" USING gin (to_tsvector(\'simple\'::regconfig, address))';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        columns: [{ expression: "to_tsvector('simple'::regconfig, address)", name: 'address' }],
        indexType: 'gin',
        unique: false,
        indexdef,
      };
      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse INCLUDE', () => {
      const indexdef =
        'CREATE INDEX "Patient_Token_code_system_value_idx" ON public."Patient_Token" USING btree (code, system, value) INCLUDE ("resourceId")';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        indexType: 'btree',
        columns: ['code', 'system', 'value'],
        include: ['resourceId'],
        unique: false,
        indexdef,
      };
      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse WHERE', () => {
      const indexdef =
        'CREATE INDEX "Coding_Property_target_property_coding_idx" ON public."Coding_Property" USING btree (target, property, coding) WHERE (target IS NOT NULL)';
      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        columns: ['target', 'property', 'coding'],
        indexType: 'btree',
        where: 'target IS NOT NULL',
        unique: false,
        indexdef,
      };
      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
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
