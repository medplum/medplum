import { readJson } from ".";

test('Read FHIR schema JSON', () => {
  const result = readJson('../lib/fhir/r4/fhir.schema.json');
  expect(result).not.toBeNull();
});
