import { readJson } from '.';

describe('Definitions', () => {
  test('Read FHIR schema JSON', () => {
    const result = readJson('../dist/fhir/r4/fhir.schema.json');
    expect(result).not.toBeNull();
  });
});
