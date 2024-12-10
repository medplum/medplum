import { getDataType, InternalTypeSchema } from '@medplum/core';
import {
  buildCreateTables,
  indexStructureDefinitionsAndSearchParameters,
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
      const result: SchemaDefinition = { tables: [] };
      const dataTypes: [ResourceType, InternalTypeSchema][] = [['Patient', getDataType('Patient')]];
      for (const [resourceType, typeSchema] of dataTypes) {
        buildCreateTables(result, resourceType, typeSchema);
      }
      expect(result.tables.map((t) => t.name)).toEqual([
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
          defaultValue: 'FALSE',
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

      expect(table.columns).toHaveLength(expectedColumns.length);
      expect(table.columns).toEqual(expect.arrayContaining(expectedColumns));
    });
  });
});
