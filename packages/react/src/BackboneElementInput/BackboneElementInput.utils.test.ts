import { parseStructureDefinition } from '@medplum/core';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildBackboneElementContext } from './BackboneElementInput.utils';

describe('buildBackboneElementContext', () => {
  test('deeply nested schema', () => {
    const sd = JSON.parse(
      readFileSync(resolve(__dirname, '__test__', 'StructureDefinition-us-core-medicationrequest.json'), 'utf8')
    );
    const schema = parseStructureDefinition(sd);

    const context = buildBackboneElementContext(schema, sd.url);

    expect(context.profileUrl).toEqual(sd.url);
    expect(context.getModifiedNestedElement('MedicationRequest.dosageInstruction.method')).toBeDefined();
  });
});
