import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

describe('FHIR Mapper transform - evaluate', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('string concatenation', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = src.value + '_test';
    }`;

    const input = [toTypedValue({ value: 'foo' })];
    const expected = [toTypedValue({ value: 'foo_test' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('variable concatenation', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.value as v -> tgt.value = v.foo + '_test';
    }`;

    const input = [toTypedValue({ value: { foo: 'bar' } })];
    const expected = [toTypedValue({ value: 'bar_test' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });
});
