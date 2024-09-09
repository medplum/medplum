import { readJson } from '@medplum/definitions';
import { Bundle, Questionnaire } from '@medplum/fhirtypes';
import { PropertyType, TypedValue } from '../types';
import { InternalSchemaElement, indexStructureDefinitionBundle } from '../typeschema/types';
import {
  fhirPathArrayEquals,
  fhirPathArrayEquivalent,
  fhirPathEquals,
  fhirPathEquivalent,
  fhirPathIs,
  getTypedPropertyValue,
  getTypedPropertyValueWithSchema,
  isDateString,
  isDateTimeString,
  toJsBoolean,
  toPeriod,
  toTypedValue,
} from './utils';

const TYPED_TRUE = { type: PropertyType.boolean, value: true };
const TYPED_FALSE = { type: PropertyType.boolean, value: false };
const TYPED_1 = { type: PropertyType.integer, value: 1 };
const TYPED_2 = { type: PropertyType.integer, value: 2 };
const TYPED_CODING_MEDPLUM123 = { type: PropertyType.Coding, value: { code: 'MEDPLUM123' } };
const TYPED_CODING_MEDPLUM123_W_SYSTEM = {
  type: PropertyType.Coding,
  value: { code: 'MEDPLUM123', system: 'medplum-v123.456.789' },
};
const TYPED_CODING_NOT_MEDPLUM123 = { type: PropertyType.Coding, value: { code: 'NOT_MEDPLUM123' } };

describe('FHIRPath utils', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('toJsBoolean', () => {
    expect(toJsBoolean([{ type: PropertyType.BackboneElement, value: undefined }])).toEqual(false);
    expect(toJsBoolean([{ type: PropertyType.BackboneElement, value: null }])).toEqual(false);
    expect(toJsBoolean([{ type: PropertyType.boolean, value: false }])).toEqual(false);
    expect(toJsBoolean([{ type: PropertyType.boolean, value: true }])).toEqual(true);
    expect(toJsBoolean([{ type: PropertyType.string, value: '' }])).toEqual(false);
    expect(toJsBoolean([{ type: PropertyType.string, value: 'hi' }])).toEqual(true);
  });

  test('toTypedValue', () => {
    expect(toTypedValue(1)).toEqual(TYPED_1);
    expect(toTypedValue(1.5)).toEqual({ type: PropertyType.decimal, value: 1.5 });
    expect(toTypedValue(true)).toEqual(TYPED_TRUE);
    expect(toTypedValue(false)).toEqual(TYPED_FALSE);
    expect(toTypedValue('xyz')).toEqual({ type: PropertyType.string, value: 'xyz' });
    expect(toTypedValue({ value: 123, unit: 'mg' })).toEqual({
      type: PropertyType.Quantity,
      value: { value: 123, unit: 'mg' },
    });
  });

  test('fhirPathIs', () => {
    expect(fhirPathIs({ type: PropertyType.string, value: undefined }, 'string')).toEqual(false);
    expect(fhirPathIs({ type: PropertyType.BackboneElement, value: {} }, 'Patient')).toEqual(false);
    expect(fhirPathIs({ type: PropertyType.BackboneElement, value: { resourceType: 'Patient' } }, 'Patient')).toEqual(
      true
    );
    expect(
      fhirPathIs({ type: PropertyType.BackboneElement, value: { resourceType: 'Observation' } }, 'Patient')
    ).toEqual(false);
    expect(fhirPathIs({ type: PropertyType.boolean, value: true }, 'Boolean')).toEqual(true);
    expect(fhirPathIs({ type: PropertyType.boolean, value: false }, 'Boolean')).toEqual(true);
    expect(fhirPathIs({ type: PropertyType.integer, value: 100 }, 'Boolean')).toEqual(false);
    expect(fhirPathIs({ type: PropertyType.BackboneElement, value: {} }, 'Boolean')).toEqual(false);
  });

  test('fhirPathEquals', () => {
    expect(fhirPathEquals(TYPED_TRUE, TYPED_TRUE)).toEqual([TYPED_TRUE]);
    expect(fhirPathEquals(TYPED_TRUE, TYPED_FALSE)).toEqual([TYPED_FALSE]);
    expect(fhirPathEquals(TYPED_1, TYPED_1)).toEqual([TYPED_TRUE]);
    expect(fhirPathEquals(TYPED_1, TYPED_2)).toEqual([TYPED_FALSE]);
    expect(fhirPathEquals(TYPED_2, TYPED_1)).toEqual([TYPED_FALSE]);
  });

  test('fhirPathArrayEquals', () => {
    expect(fhirPathArrayEquals([TYPED_1], [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquals([TYPED_1], [TYPED_2])).toEqual([TYPED_FALSE]);

    // Acceptable threshold
    expect(fhirPathArrayEquals([toTypedValue(1.0)], [toTypedValue(1.0001)])).toEqual([TYPED_FALSE]);
    expect(fhirPathArrayEquals([toTypedValue(1.0)], [toTypedValue(1.5)])).toEqual([TYPED_FALSE]);

    // Sort order does matter
    expect(fhirPathArrayEquals([TYPED_1, TYPED_2], [TYPED_2, TYPED_1])).toEqual([TYPED_FALSE]);
    expect(fhirPathArrayEquals([TYPED_1, TYPED_2], [TYPED_1, TYPED_1])).toEqual([TYPED_FALSE]);
  });

  test('fhirPathEquivalent', () => {
    expect(fhirPathEquivalent(TYPED_TRUE, TYPED_TRUE)).toEqual([TYPED_TRUE]);
    expect(fhirPathEquivalent(TYPED_TRUE, TYPED_FALSE)).toEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_1, TYPED_1)).toEqual([TYPED_TRUE]);
    expect(fhirPathEquivalent(TYPED_1, TYPED_2)).toEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_2, TYPED_1)).toEqual([TYPED_FALSE]);

    // Test `Coding` equivalence
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123, TYPED_CODING_MEDPLUM123)).toEqual([TYPED_TRUE]);
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123, TYPED_CODING_MEDPLUM123_W_SYSTEM)).toEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123, TYPED_CODING_NOT_MEDPLUM123)).toEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123_W_SYSTEM, TYPED_CODING_MEDPLUM123_W_SYSTEM)).toEqual([
      TYPED_TRUE,
    ]);
  });

  test('fhirPathArrayEquivalent', () => {
    expect(fhirPathArrayEquivalent([TYPED_1], [TYPED_1])).toEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquivalent([TYPED_1], [TYPED_2])).toEqual([TYPED_FALSE]);

    // Acceptable threshold
    expect(fhirPathArrayEquivalent([toTypedValue(1.0)], [toTypedValue(1.0001)])).toEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquivalent([toTypedValue(1.0)], [toTypedValue(1.5)])).toEqual([TYPED_FALSE]);

    // Sort order does not matter
    expect(fhirPathArrayEquivalent([TYPED_1, TYPED_2], [TYPED_2, TYPED_1])).toEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquivalent([TYPED_1, TYPED_2], [TYPED_1, TYPED_1])).toEqual([TYPED_FALSE]);
  });

  test('getTypedPropertyValue', () => {
    expect(getTypedPropertyValue({ type: '', value: undefined }, 'x')).toBeUndefined();
    expect(getTypedPropertyValue({ type: '', value: null }, 'x')).toBeUndefined();
    expect(getTypedPropertyValue({ type: 'x', value: {} }, 'x')).toBeUndefined();
    expect(getTypedPropertyValue({ type: 'integer', value: 123 }, 'x')).toBeUndefined();

    // Support missing schemas
    expect(getTypedPropertyValue({ type: 'Foo', value: { x: 1 } }, 'x')).toEqual(TYPED_1);
    expect(getTypedPropertyValue({ type: 'Foo', value: { x: [1] } }, 'x')).toEqual([TYPED_1]);
    expect(getTypedPropertyValue({ type: 'Foo', value: { valueInteger: 1 } }, 'value')).toEqual(TYPED_1);

    // Only use valid property types
    expect(
      getTypedPropertyValue(toTypedValue({ resourceType: 'Patient', identifier: [{ value: 'foo' }] }), 'id')
    ).toBeUndefined();
    expect(getTypedPropertyValue(toTypedValue({ resourceType: 'AccessPolicy' }), 'resource')).toBeUndefined();

    // Silently ignore empty arrays
    expect(
      getTypedPropertyValue(toTypedValue({ resourceType: 'Patient', identifier: [] }), 'identifier')
    ).toBeUndefined();
    expect(getTypedPropertyValue({ type: 'X', value: { x: [] } }, 'x')).toBeUndefined();

    // Property path that is part of multi-type element in schema
    expect(getTypedPropertyValue({ type: 'Extension', value: { valueBoolean: true } }, 'valueBoolean')).toEqual({
      type: 'boolean',
      value: true,
    });
  });

  test('Bundle entries', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            identifier: [{ value: 'foo' }],
          },
        },
      ],
    };

    const result1 = getTypedPropertyValue(toTypedValue(bundle), 'entry') as TypedValue[];
    expect(result1).toHaveLength(1);

    const bundleEntry = result1[0];
    expect(bundleEntry).toMatchObject({
      type: 'BundleEntry',
      value: {
        resource: {
          resourceType: 'Patient',
        },
      },
    });

    const patient = getTypedPropertyValue(bundleEntry, 'resource') as TypedValue;
    expect(patient).toMatchObject({
      type: 'Patient',
      value: {
        resourceType: 'Patient',
      },
    });
  });

  test('Content references', () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        {
          linkId: '1',
          type: 'group',
          item: [
            {
              linkId: '1.1',
              type: 'display',
            },
          ],
        },
      ],
    };

    const result1 = getTypedPropertyValue(toTypedValue(questionnaire), 'item') as TypedValue[];
    expect(result1).toHaveLength(1);

    const item1 = result1[0];
    expect(item1).toMatchObject({
      type: 'QuestionnaireItem',
      value: {
        linkId: '1',
        type: 'group',
      },
    });

    const result2 = getTypedPropertyValue(item1, 'item') as TypedValue[];
    expect(result2).toHaveLength(1);

    const item2 = result2[0];
    expect(item2).toMatchObject({
      type: 'QuestionnaireItem',
      value: {
        linkId: '1.1',
        type: 'display',
      },
    });
  });

  test('getTypedPropertyValueWithSchema', () => {
    const typedValue: TypedValue = { type: 'Patient', value: { active: true } };
    const path = 'active';
    const goodElement: InternalSchemaElement = {
      description: '',
      path: 'Patient.active',
      min: 0,
      max: 0,
      type: [{ code: 'boolean' }],
    };
    expect(getTypedPropertyValueWithSchema(typedValue, path, goodElement)).toEqual({ type: 'boolean', value: true });

    const choiceOfTypeTypedValue: TypedValue = { type: 'Extension', value: { valueBoolean: true } };
    const extensionValueX: InternalSchemaElement = {
      description: '',
      path: 'Extension.value[x]',
      min: 1,
      max: 1,
      type: [{ code: 'boolean' }],
    };
    expect(getTypedPropertyValueWithSchema(choiceOfTypeTypedValue, 'value[x]', extensionValueX)).toEqual({
      type: 'boolean',
      value: true,
    });
  });

  test('getTypedPropertyValueWithSchema with primitive extensions', () => {
    const humanName = {
      given: ['John', 'Johnny'],
      _given: [{ extension: [{ url: 'http://example.com', valueBoolean: true }] }],
    };
    const given: InternalSchemaElement = {
      description: '',
      path: 'HumanName.given',
      min: 0,
      max: 2,
      isArray: true,
      type: [{ code: 'string' }],
    };
    getTypedPropertyValueWithSchema({ type: 'HumanName', value: humanName }, 'given', given);
    expect(humanName.given).toEqual(expect.arrayContaining(['John', 'Johnny']));
    // with primitive extensions, array values can be changed into a `String` type which has a typeof 'object'
    // ensure the original input array values is not mutated as such
    expect(humanName.given.every((g) => typeof g === 'string')).toBe(true);
  });

  test('isDateString', () => {
    expect(isDateString(undefined)).toBe(false);
    expect(isDateString(null)).toBe(false);
    expect(isDateString('')).toBe(false);
    expect(isDateString('x')).toBe(false);
    expect(isDateString('2020')).toBe(true);
    expect(isDateString('2020-01')).toBe(true);
    expect(isDateString('2020-01-01')).toBe(true);
    expect(isDateString('2020-01-01T')).toBe(false);
  });

  test('isDateTimeString', () => {
    expect(isDateTimeString(undefined)).toBe(false);
    expect(isDateTimeString(null)).toBe(false);
    expect(isDateTimeString('')).toBe(false);
    expect(isDateTimeString('x')).toBe(false);
    expect(isDateTimeString('2020')).toBe(true);
    expect(isDateTimeString('2020-01')).toBe(true);
    expect(isDateTimeString('2020-01-01')).toBe(true);
    expect(isDateTimeString('2020-01-01T12:34:56Z')).toBe(true);
  });

  test('toPeriod', () => {
    expect(toPeriod(undefined)).toBeUndefined();
    expect(toPeriod(null)).toBeUndefined();
    expect(toPeriod('')).toBeUndefined();
    expect(toPeriod('x')).toBeUndefined();
    expect(toPeriod({})).toBeUndefined();
    expect(toPeriod('2020-01-01')).toMatchObject({
      start: '2020-01-01T00:00:00.000Z',
      end: '2020-01-01T23:59:59.999Z',
    });
    expect(toPeriod('2020-01-01T12:34:56.000Z')).toMatchObject({
      start: '2020-01-01T12:34:56.000Z',
      end: '2020-01-01T12:34:56.000Z',
    });
    expect(
      toPeriod({
        start: '2020-01-01T12:34:56.000Z',
        end: '2020-01-01T12:34:56.999Z',
      })
    ).toMatchObject({
      start: '2020-01-01T12:34:56.000Z',
      end: '2020-01-01T12:34:56.999Z',
    });
  });
});
