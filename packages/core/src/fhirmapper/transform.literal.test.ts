import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

// Based on: https://github.com/Vermonster/fhir-kit-mapping-language/blob/master/test/engine/literal.test.js
// MIT License

describe('FHIR Mapper transform - literal', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('string', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = 'test';
    }`;

    const input = [toTypedValue({})];
    const expected = [toTypedValue({ value: 'test' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
    expect(typeof actual[0].value.value).toBe('string');
  });

  test('integer', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = 121;
    }`;

    const input = [toTypedValue({})];
    const expected = [{ type: 'BackboneElement', value: { value: 121 } }];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
    expect(typeof actual[0].value.value).toBe('number');
  });

  test('number', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = 1.21;
    }`;

    const input = [toTypedValue({})];
    const expected = [{ type: 'BackboneElement', value: { value: 1.21 } }];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
    expect(typeof actual[0].value.value).toBe('number');
  });

  test('bool, true', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = true;
    }`;

    const input = [toTypedValue({})];
    const expected = [toTypedValue({ value: true })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
    expect(typeof actual[0].value.value).toBe('boolean');
  });

  test('bool, false', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = false;
    }`;

    const input = [toTypedValue({})];
    const expected = [toTypedValue({ value: false })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
    expect(typeof actual[0].value.value).toBe('boolean');
  });

  test('datetime', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = @2019-08-19T16:22:23.118Z;
    }`;

    const input = [toTypedValue({})];
    const expected = [toTypedValue({ value: '2019-08-19T16:22:23.118Z' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });
});
