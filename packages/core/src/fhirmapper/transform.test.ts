import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

// All examples from the FHIR Mapping Language Tutorial
// See: https://build.fhir.org/mapping-tutorial.html

describe('FHIR Mapper transform', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Simplest possible transform', () => {
    // https://build.fhir.org/mapping-tutorial.html#step1
    // To start with, we're going to consider a very simple case: mapping between two structures
    // that have the same definition, a single element with the same name and the same primitive type.

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a as a -> tgt.a = a "rule_a";
      }
    `;

    const input = [toTypedValue({ a: 'a' })];
    const expected = [toTypedValue({ a: 'a' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Fields with different names', () => {
    // https://build.fhir.org/mapping-tutorial.html#step2
    // Now consider the case where the elements have different names.

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a1 as b -> tgt.a2 = b;
      }
    `;

    const input = [toTypedValue({ a1: 'a' })];
    const expected = [toTypedValue({ a2: 'a' })];
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

    const input = [toTypedValue({ a2: 'abcdef' })];
    const expected = [toTypedValue({ a2: 'abc' })];
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

    const input1 = [toTypedValue({ a2: 'abcdef' })];
    const expected1 = [toTypedValue({})];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [toTypedValue({ a2: 'abc' })];
    const expected2 = [toTypedValue({ a2: 'abc' })];
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

    const input1 = [toTypedValue({ a2: 'abcdef' })];
    try {
      structureMapTransform(parseMappingLanguage(map), input1);
      throw new Error('Expected error');
    } catch (err: any) {
      expect(err.message).toBe('Check failed: a2.length() <= 3');
    }

    const input2 = [toTypedValue({ a2: 'abc' })];
    const expected2 = [toTypedValue({ a2: 'abc' })];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Set to primitive integer', () => {
    // https://build.fhir.org/mapping-tutorial.html#step4
    // Now for the case where there is a simple type conversion between the primitive types on the left and right,
    // in this case from a string to an integer.

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a3 as a -> tgt.a3 = 123;
      }
    `;

    const input = [toTypedValue({ a3: 1 })];
    const expected = [toTypedValue({ a3: 123 })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Copy array, simple', () => {
    // https://build.fhir.org/mapping-tutorial.html#step5
    // Back to the simple case where src.a22 is copied to tgt.a22,
    // but in this case, a22 can repeat (in both source and target)

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a22 as a -> tgt.a22 = a;
      }
    `;

    const input = [toTypedValue({ a22: ['a', 'b', 'c'] }), toTypedValue({ a22: [] })];
    const expected = [toTypedValue({ a22: ['a', 'b', 'c'] })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Copy array, only one', () => {
    // https://build.fhir.org/mapping-tutorial.html#step6

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a23 only_one as a -> tgt.a23 = a;  // transform engine throws an error if there is more than one
      }
    `;

    const input1 = [toTypedValue({ a23: ['a'] })];
    const expected1 = [toTypedValue({ a23: 'a' })];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [toTypedValue({ a23: ['a', 'b', 'c'] })];
    expect(() => structureMapTransform(parseMappingLanguage(map), input2)).toThrow();
  });

  test('Copy array, only first', () => {
    // https://build.fhir.org/mapping-tutorial.html#step6

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a23 first as a -> tgt.a23 = a;  // Only use the first one
      }
    `;

    const input1 = [toTypedValue({ a23: ['a'] })];
    const expected1 = [toTypedValue({ a23: 'a' })];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [toTypedValue({ a23: ['a', 'b', 'c'] })];
    const expected2 = [toTypedValue({ a23: 'a' })];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Copy array, not first', () => {
    // https://build.fhir.org/mapping-tutorial.html#step6

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a23 not_first as a -> tgt.a23 = a;  // Process this rule for all but the first
      }
    `;

    const input1 = [toTypedValue({ a23: ['a'] }), toTypedValue({ a23: [] })];
    const expected1 = [toTypedValue({ a23: [] })];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [toTypedValue({ a23: ['a', 'b', 'c'] }), toTypedValue({ a23: [] })];
    const expected2 = [toTypedValue({ a23: ['b', 'c'] })];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Copy array, only last', () => {
    // https://build.fhir.org/mapping-tutorial.html#step6

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a23 last as a -> tgt.a23 = a;  // Only use the last one
      }
    `;

    const input1 = [toTypedValue({ a23: ['a'] })];
    const expected1 = [toTypedValue({ a23: 'a' })];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [toTypedValue({ a23: ['a', 'b', 'c'] })];
    const expected2 = [toTypedValue({ a23: 'c' })];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Copy array, not last', () => {
    // https://build.fhir.org/mapping-tutorial.html#step6

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.a23 not_last as a -> tgt.a23 = a;  // Process this rule for all but the last
      }
    `;

    const input1 = [toTypedValue({ a23: ['a'] }), toTypedValue({ a23: [] })];
    const expected1 = [toTypedValue({ a23: [] })];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [toTypedValue({ a23: ['a', 'b', 'c'] }), toTypedValue({ a23: [] })];
    const expected2 = [toTypedValue({ a23: ['a', 'b'] })];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Simple nesting', () => {
    // https://build.fhir.org/mapping-tutorial.html#step7
    // Most transformations involve nested content.
    // Let's start with a simple case, where element aa contains ab:

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.aa as s_aa -> tgt.aa as t_aa then { // make aa exist
          s_aa.ab as ab -> t_aa.ab = ab; // copy ab inside aa
        };
      }
    `;

    const input = [toTypedValue({ aa: { ab: 'a' } })];
    const expected = [toTypedValue({ aa: { ab: 'a' } })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Translation', () => {
    // https://build.fhir.org/mapping-tutorial.html#step8
    // A common translation pattern is to perform a translation e.g. from one set of codes to another

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      conceptmap "uri-of-concept-map" {
        prefix s = "http://terminology.hl7.org/ValueSet/v3-AdministrativeGender"
        prefix t = "http://hl7.org/fhir/ValueSet/administrative-gender"

        s:M == t:male
        s:F == t:female
      }

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.d as d -> tgt.d = translate(d, 'uri-of-concept-map', 'code');
      }
    `;

    const input = [toTypedValue({ d: 'M' })];
    const expected = [toTypedValue({ d: 'male' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Co-dependency in translation', () => {
    // https://build.fhir.org/mapping-tutorial.html#step9
    // Another common translation is where the target mapping for one element depends on the value of another element.

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.i as i where m < 2 -> tgt.j = i;
        src.i as i where m >= 2 -> tgt.k = i;
      }
    `;

    const input1 = [toTypedValue({ i: 'foo', m: 1 })];
    const expected1 = [toTypedValue({ j: 'foo' })];
    const actual1 = structureMapTransform(parseMappingLanguage(map), input1);
    expect(actual1).toMatchObject(expected1);

    const input2 = [toTypedValue({ i: 'foo', m: 3 })];
    const expected2 = [toTypedValue({ k: 'foo' })];
    const actual2 = structureMapTransform(parseMappingLanguage(map), input2);
    expect(actual2).toMatchObject(expected2);
  });

  test('Reworking Structure #1', () => {
    // https://build.fhir.org/mapping-tutorial.html#step11
    // It's now time to start moving away from relatively simple cases to some of the harder ones to manage mappings for.
    // The first mixes list management, and converting from a specific structure to a general structure:

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        src.e as s_e -> tgt.e as t_e then {
          for s_e -> t_e.f = s_e, t_e.g = 'g1';
        };

        src.f as s_f -> tgt.e as t_e first then {
          s_f -> t_e.f = s_f, t_e.g = 'g2';
        };
      }
    `;

    const input = [toTypedValue({ e: ['foo', 'bar'], f: 'baz' }), toTypedValue({ e: [] })];
    const expected = [
      toTypedValue({
        e: [
          { f: 'foo', g: 'g1' },
          { f: 'bar', g: 'g1' },
          { f: 'baz', g: 'g2' },
        ],
      }),
    ];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('Reworking Structure #2', () => {
    // https://build.fhir.org/mapping-tutorial.html#step12
    // The second example for reworking structure moves cardinality around the hierarchy.
    // In this case, the source has an optional structure that contains a repeating structure,
    // while the target puts the cardinality at the next level up:

    const map = `
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
      uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

      group tutorial(source src : TLeft, target tgt : TRight) {
        // setting up a variable for the parent
        src.az1 as s_az1 then {

          // one tgt.az1 for each az3
          s_az1.az3 as s_az3 -> tgt.az1 as t_az1 then {
            // value for az2. Note that this refers to a previous context in the source
            s_az1.az2 as az2 -> t_az1.az2 = az2;

            // value for az3
            s_az3 -> t_az1.az3 = s_az3;
          };
        };
      }
    `;

    const input = [toTypedValue({ az1: { az2: 'foo', az3: ['bar', 'baz'] }, f: 'baz' }), toTypedValue({ az1: [] })];
    const expected = [
      toTypedValue({
        az1: [
          { az2: 'foo', az3: 'bar' },
          { az2: 'foo', az3: 'baz' },
        ],
      }),
    ];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });
});
