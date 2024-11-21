import { getDataType, InternalTypeSchema } from '@medplum/core';
import {
  buildCreateTables,
  IndexColumn,
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

    test('Observation', () => {
      const result: SchemaDefinition = { tables: [] };
      const dataTypes: [ResourceType, InternalTypeSchema][] = [['Observation', getDataType('Observation')]];
      for (const [resourceType, typeSchema] of dataTypes) {
        buildCreateTables(result, resourceType, typeSchema);
      }
      expect(result.tables.map((t) => t.name)).toEqual([
        'Observation',
        'Observation_History',
        'Observation_Token',
        'Observation_References',
      ]);

      const observation = result.tables.find((t) => t.name === 'Observation') as TableDefinition;
      expect(observation).toBeDefined();

      expect(observation.columns.find((c) => c.name === 'code')?.type).toEqual(
        'TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL'
      );
      expect(observation.columns.find((c) => c.name === 'codeText')?.type).toEqual(
        'TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL'
      );

      expect(
        observation.indexes.find((i) => i.columns.find((ic) => (ic as IndexColumn)?.name === 'code_trgm'))
      ).toBeDefined();

      expect(
        observation.indexes.find((i) => i.columns.find((ic) => (ic as IndexColumn)?.name === 'codeText_trgm'))
      ).toBeDefined();
    });
  });
});
