import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

describe('FHIR Mapper transform - errors', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('No source parameters', () => {
    const map = `map "http://test.com" = test
    group example(target tgt) {
      src.name as v -> tgt.name = v;
    }`;

    try {
      structureMapTransform(parseMappingLanguage(map), []);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Missing source definitions');
    }
  });

  test('No target parameters', () => {
    const map = `map "http://test.com" = test
    group example(source src) {
      src.name as v -> tgt.name = v;
    }`;

    try {
      structureMapTransform(parseMappingLanguage(map), []);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Missing target definitions');
    }
  });

  test('Not enough arguments', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as v -> tgt.name = v;
    }`;

    try {
      structureMapTransform(parseMappingLanguage(map), []);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Not enough arguments (got 0, min 1)');
    }
  });

  test('Too many arguments', () => {
    const map = `map "http://test.com" = test
    group example(source src, target tgt) {
      src.name as v -> tgt.name = v;
    }`;

    try {
      structureMapTransform(parseMappingLanguage(map), [{}, {}, {}]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Too many arguments (got 3, max 2)');
    }
  });

  test('Target not found', () => {
    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target
      
      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a as a -> notFound.a = a "rule_a";
      }
    `;

    try {
      structureMapTransform(parseMappingLanguage(map), [{}]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Target not found: notFound');
    }
  });
});
