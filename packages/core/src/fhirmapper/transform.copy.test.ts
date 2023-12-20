import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

// Based on: https://github.com/Vermonster/fhir-kit-mapping-language/blob/master/test/engine/copy-concrete.test.js
// MIT License

describe('FHIR Mapper transform - copy', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('single rule, single source, new target', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as v -> tgt.name = v;
    }`;

    const input = [toTypedValue({ name: 'bob' })];
    const expected = [toTypedValue({ name: 'bob' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('single rule, single source, existing target', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as v -> tgt.name = v;
    }`;

    const input = [toTypedValue({ name: 'bob' }), toTypedValue({ size: 'average' })];
    const expected = [toTypedValue({ name: 'bob', size: 'average' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('single rule, multiple source contexts, multiple target transforms', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as v, src.size as s -> tgt.firstName = v, tgt.size = s;
    }`;

    const input = [toTypedValue({ name: 'bob', size: 'small' })];
    const expected = [toTypedValue({ firstName: 'bob', size: 'small' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('single rule, single source, multiple target transforms', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as v -> tgt.name = v, tgt.oldName = v;
    }`;

    const input = [toTypedValue({ name: 'bob' })];
    const expected = [toTypedValue({ name: 'bob', oldName: 'bob' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('multiple rules, single source, new target', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as v -> tgt.name = v;
      src.size as v -> tgt.size = v;
      src.active as sa -> tgt.activeStatus = sa;
    }`;

    const input = [toTypedValue({ name: 'bob', size: 'small', active: true })];
    const expected = [toTypedValue({ name: 'bob', size: 'small', activeStatus: true })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('multiple rules, multiple sources, new target', () => {
    const map = `map "http://test.com" = test
    group example(source src, source src2, target tgt) {
      src.name as v -> tgt.name = v;
      src2.size as v -> tgt.size = v;
    }`;

    const input = [toTypedValue({ name: 'bob' }), toTypedValue({ size: 'small' })];
    const expected = [toTypedValue({ name: 'bob', size: 'small' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('multiple rules, single source, multiple new actual', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt, target tgt2) {
      src.name as v -> tgt.name = v;
      src.size as v -> tgt2.size = v;
    }`;

    const input = [toTypedValue({ name: 'bob', size: 'small' })];
    const expected = [toTypedValue({ name: 'bob' }), toTypedValue({ size: 'small' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });

  test('multiple rules, multiple single sources, multiple exiting actual', () => {
    const map = `map "http://test.com" = test
    group example(source src, source src2, target tgt, target tgt2) {
      src.name as v -> tgt.name = v;
      src.name as v -> tgt2.name = v;
      src2.size as ss -> tgt2.size = ss;
    }`;

    const input = [
      toTypedValue({ name: 'bob' }),
      toTypedValue({ size: 'small' }),
      toTypedValue({ active: true }),
      toTypedValue({ active: true }),
    ];
    const expected = [
      toTypedValue({ name: 'bob', active: true }),
      toTypedValue({ name: 'bob', size: 'small', active: true }),
    ];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
  });
});
