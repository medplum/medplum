import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

// Based on: https://github.com/Vermonster/fhir-kit-mapping-language/blob/master/test/engine/copy-concrete.test.js
// MIT License

describe('FHIR Mapper transform - dependent', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('rule', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as vn -> tgt.name as tn then {
        vn.firstName as g -> tn.firstName = g;
        vn.lastName as ln -> tn.familyName = ln;
      };
    }`;

    const input = [toTypedValue({ name: { firstName: 'bob', lastName: 'smith' } })];
    const expected = [toTypedValue({ name: { firstName: 'bob', familyName: 'smith' } })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('invocation', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.status as ss -> tgt.statusCode = ss;
      src.name as vn -> tgt.name as tn then name(vn, tn);
    }

    group name(source src, target tgt) {
      src.firstName as ss -> tgt.firstName = ss;
      src.lastName as ln -> tgt.familyName = ln;
    }`;

    const input = [toTypedValue({ status: 'active', name: { firstName: 'bob', lastName: 'smith' } })];
    const expected = [toTypedValue({ statusCode: 'active', name: { firstName: 'bob', familyName: 'smith' } })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Group not found', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.status as ss -> tgt.statusCode = ss;
      src.name as vn -> tgt.name as tn then doesNotExist(vn, tn);
    }`;

    try {
      structureMapTransform(parseMappingLanguage(map), [toTypedValue({ status: 'x', name: 'y' })]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toBe('Dependent group not found: doesNotExist');
    }
  });

  test('Recursion', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.section as srcSection -> tgt.section as tgtSection then section(srcSection, tgtSection);
    }

    group section(source src, target tgt) {
      src.name as srcName -> tgt.name = srcName;
      src.section as srcSection -> tgt.section as tgtSection then section(srcSection, tgtSection);
    }`;

    const input = [toTypedValue({ section: { section: { name: 'foo' } } })];
    const expected = [toTypedValue({ section: { section: { name: 'foo' } } })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });
});
