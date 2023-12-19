import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

describe('FHIR Mapper transform', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Simplest possible transform', () => {
    // https://build.fhir.org/mapping-tutorial.html#step1

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target
      
      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a as a -> tgt.a = a "rule_a";
      }
    `;

    const input = [{ a: 'a' }];
    const expected = [{ a: 'a' }];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Fields with different names', () => {
    // https://build.fhir.org/mapping-tutorial.html#step2

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target
      
      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a1 as b -> tgt.a2 = b;
      }
    `;

    const input = [{ a1: 'a' }];
    const expected = [{ a2: 'a' }];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Length restriction truncate', () => {
    // https://build.fhir.org/mapping-tutorial.html#step3

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target
      
      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a2 as a -> tgt.a2 = truncate(a, 3); // just cut it off at 3 characters
      }
    `;

    const input = [{ a2: 'abcdef' }];
    const expected = [{ a2: 'abc' }];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Length restriction ignore', () => {
    // https://build.fhir.org/mapping-tutorial.html#step3

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target
      
      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a2 as a where a2.length() <= 3 -> tgt.a2 = a; // ignore it
      }
    `;

    const input1 = [{ a2: 'abcdef' }];
    const expected1 = [{ a2: undefined }];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [{ a2: 'abc' }];
    const expected2 = [{ a2: 'abc' }];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Length restriction error', () => {
    // https://build.fhir.org/mapping-tutorial.html#step3

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target
      
      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a2 as a check a2.length() <= 3 -> tgt.a2 = a; // error if it's longer than 20 characters
      }
    `;

    const input1 = [{ a2: 'abcdef' }];
    try {
      structureMapTransform(parseMappingLanguage(map), input1);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toBe('Check failed: a2.length() <= 3');
    }

    const input2 = [{ a2: 'abc' }];
    const expected2 = [{ a2: 'abc' }];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Set to primitive integer', () => {
    // https://build.fhir.org/mapping-tutorial.html#step4

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target
      
      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a3 as a -> tgt.a3 = 123;
      }
    `;

    const input = [{ a3: 1 }];
    const expected = [{ a3: 123 }];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });
});
