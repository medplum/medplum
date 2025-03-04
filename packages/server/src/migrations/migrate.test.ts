import { getDataType, InternalTypeSchema } from '@medplum/core';
import {
  buildCreateTables,
  IndexDefinition,
  indexDefinitionsEqual,
  indexStructureDefinitionsAndSearchParameters,
  parseIndexDefinition,
  SchemaDefinition,
  TableDefinition,
} from './migrate';
import { ResourceType } from '@medplum/fhirtypes';

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
      expect(result.tables.map((t) => t.name)).toStrictEqual([
        'Patient',
        'Patient_History',
        'Patient_Token',
        'Patient_References',
      ]);

      const table = result.tables.find((t) => t.name === 'Patient') as TableDefinition;
      expect(table).toBeDefined();

      const expectedColumns = [
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
      ];

      expect(table.columns).toStrictEqual(expectedColumns);
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
});
