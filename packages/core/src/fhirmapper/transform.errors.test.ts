import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
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
      structureMapTransform(parseMappingLanguage(map), [toTypedValue({}), toTypedValue({}), toTypedValue({})]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Too many arguments (got 3, max 2)');
    }
  });

  test('Source not found', () => {
    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        notFound.a as a -> tgt.a = a "rule_a";
      }
    `;

    const input = [{ type: 'TLeft', value: { a: 'abc' } }];
    const expected = [{ type: 'TRight', value: {} }];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toEqual(expected);
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
      structureMapTransform(parseMappingLanguage(map), [toTypedValue({ a: 'abc' })]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Target not found: notFound');
    }
  });

  test('Invalid property', () => {
    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a as a -> tgt.prototype = a "rule_a";
      }
    `;

    try {
      structureMapTransform(parseMappingLanguage(map), [toTypedValue({ a: 'abc' })]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Invalid key: prototype');
    }
  });

  test('Unsupported transform', () => {
    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a as a -> tgt.a = unsupported(a);
      }
    `;

    try {
      structureMapTransform(parseMappingLanguage(map), [toTypedValue({ a: 'abc' })]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Unsupported transform: unsupported');
    }
  });

  test('Missing target param', () => {
    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a as a -> tgt.a = truncate();
      }
    `;

    try {
      structureMapTransform(parseMappingLanguage(map), [toTypedValue({ a: 'abc' })]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Missing target parameter: undefined');
    }
  });

  test('Variable not found', () => {
    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a as a -> tgt.a = truncate(x);
      }
    `;

    try {
      structureMapTransform(parseMappingLanguage(map), [toTypedValue({ a: 'abc' })]);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toEqual('Variable not found: x');
    }
  });
});
