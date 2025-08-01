import { readJson } from '@medplum/definitions';
import { Bundle, Questionnaire } from '@medplum/fhirtypes';
import { PropertyType, TypedValue } from '../types';
import { indexStructureDefinitionBundle, InternalSchemaElement } from '../typeschema/types';
import {
  fhirPathArrayEquals,
  fhirPathArrayEquivalent,
  fhirPathEquals,
  fhirPathEquivalent,
  fhirPathIs,
  getTypedPropertyValue,
  getTypedPropertyValueWithoutSchema,
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
    expect(toJsBoolean([{ type: PropertyType.BackboneElement, value: undefined }])).toStrictEqual(false);
    expect(toJsBoolean([{ type: PropertyType.BackboneElement, value: null }])).toStrictEqual(false);
    expect(toJsBoolean([{ type: PropertyType.boolean, value: false }])).toStrictEqual(false);
    expect(toJsBoolean([{ type: PropertyType.boolean, value: true }])).toStrictEqual(true);
    expect(toJsBoolean([{ type: PropertyType.string, value: '' }])).toStrictEqual(false);
    expect(toJsBoolean([{ type: PropertyType.string, value: 'hi' }])).toStrictEqual(true);
  });

  test('toTypedValue', () => {
    expect(toTypedValue(1)).toStrictEqual(TYPED_1);
    expect(toTypedValue(1.5)).toStrictEqual({ type: PropertyType.decimal, value: 1.5 });
    expect(toTypedValue(true)).toStrictEqual(TYPED_TRUE);
    expect(toTypedValue(false)).toStrictEqual(TYPED_FALSE);
    expect(toTypedValue('xyz')).toStrictEqual({ type: PropertyType.string, value: 'xyz' });
    expect(toTypedValue({ code: 'x' })).toStrictEqual({
      type: PropertyType.Coding,
      value: { code: 'x' },
    });
    expect(toTypedValue({ coding: [{ code: 'y' }] })).toStrictEqual({
      type: PropertyType.CodeableConcept,
      value: { coding: [{ code: 'y' }] },
    });
    expect(toTypedValue({ value: 123, unit: 'mg' })).toStrictEqual({
      type: PropertyType.Quantity,
      value: { value: 123, unit: 'mg' },
    });
  });

  test('fhirPathIs', () => {
    expect(fhirPathIs({ type: PropertyType.string, value: undefined }, 'string')).toStrictEqual(false);
    expect(fhirPathIs({ type: PropertyType.BackboneElement, value: {} }, 'Patient')).toStrictEqual(false);
    expect(
      fhirPathIs({ type: PropertyType.BackboneElement, value: { resourceType: 'Patient' } }, 'Patient')
    ).toStrictEqual(true);
    expect(
      fhirPathIs({ type: PropertyType.BackboneElement, value: { resourceType: 'Observation' } }, 'Patient')
    ).toStrictEqual(false);
    expect(fhirPathIs({ type: PropertyType.boolean, value: true }, 'Boolean')).toStrictEqual(true);
    expect(fhirPathIs({ type: PropertyType.boolean, value: false }, 'Boolean')).toStrictEqual(true);
    expect(fhirPathIs({ type: PropertyType.integer, value: 100 }, 'Boolean')).toStrictEqual(false);
    expect(fhirPathIs({ type: PropertyType.BackboneElement, value: {} }, 'Boolean')).toStrictEqual(false);
  });

  test('fhirPathEquals', () => {
    expect(fhirPathEquals(TYPED_TRUE, TYPED_TRUE)).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathEquals(TYPED_TRUE, TYPED_FALSE)).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathEquals(TYPED_1, TYPED_1)).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathEquals(TYPED_1, TYPED_2)).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathEquals(TYPED_2, TYPED_1)).toStrictEqual([TYPED_FALSE]);
  });

  test('fhirPathArrayEquals', () => {
    expect(fhirPathArrayEquals([TYPED_1], [TYPED_1])).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquals([TYPED_1], [TYPED_2])).toStrictEqual([TYPED_FALSE]);

    // Acceptable threshold
    expect(fhirPathArrayEquals([toTypedValue(1.0)], [toTypedValue(1.0001)])).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathArrayEquals([toTypedValue(1.0)], [toTypedValue(1.5)])).toStrictEqual([TYPED_FALSE]);

    // Sort order does matter
    expect(fhirPathArrayEquals([TYPED_1, TYPED_2], [TYPED_2, TYPED_1])).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathArrayEquals([TYPED_1, TYPED_2], [TYPED_1, TYPED_1])).toStrictEqual([TYPED_FALSE]);
  });

  test('fhirPathEquivalent', () => {
    expect(fhirPathEquivalent(TYPED_TRUE, TYPED_TRUE)).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathEquivalent(TYPED_TRUE, TYPED_FALSE)).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_1, TYPED_1)).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathEquivalent(TYPED_1, TYPED_2)).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_2, TYPED_1)).toStrictEqual([TYPED_FALSE]);

    // Test `Coding` equivalence
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123, TYPED_CODING_MEDPLUM123)).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123, TYPED_CODING_MEDPLUM123_W_SYSTEM)).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123, TYPED_CODING_NOT_MEDPLUM123)).toStrictEqual([TYPED_FALSE]);
    expect(fhirPathEquivalent(TYPED_CODING_MEDPLUM123_W_SYSTEM, TYPED_CODING_MEDPLUM123_W_SYSTEM)).toStrictEqual([
      TYPED_TRUE,
    ]);
  });

  test('fhirPathArrayEquivalent', () => {
    expect(fhirPathArrayEquivalent([TYPED_1], [TYPED_1])).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquivalent([TYPED_1], [TYPED_2])).toStrictEqual([TYPED_FALSE]);

    // Acceptable threshold
    expect(fhirPathArrayEquivalent([toTypedValue(1.0)], [toTypedValue(1.0001)])).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquivalent([toTypedValue(1.0)], [toTypedValue(1.5)])).toStrictEqual([TYPED_FALSE]);

    // Sort order does not matter
    expect(fhirPathArrayEquivalent([TYPED_1, TYPED_2], [TYPED_2, TYPED_1])).toStrictEqual([TYPED_TRUE]);
    expect(fhirPathArrayEquivalent([TYPED_1, TYPED_2], [TYPED_1, TYPED_1])).toStrictEqual([TYPED_FALSE]);
  });

  test('getTypedPropertyValue', () => {
    expect(getTypedPropertyValue({ type: '', value: undefined }, 'x')).toBeUndefined();
    expect(getTypedPropertyValue({ type: '', value: null }, 'x')).toBeUndefined();
    expect(getTypedPropertyValue({ type: 'x', value: {} }, 'x')).toBeUndefined();
    expect(getTypedPropertyValue({ type: 'integer', value: 123 }, 'x')).toBeUndefined();

    // Support missing schemas
    expect(getTypedPropertyValue({ type: 'Foo', value: { x: 1 } }, 'x')).toStrictEqual(TYPED_1);
    expect(getTypedPropertyValue({ type: 'Foo', value: { x: [1] } }, 'x')).toStrictEqual([TYPED_1]);
    expect(getTypedPropertyValue({ type: 'Foo', value: { valueInteger: 1 } }, 'value')).toStrictEqual(TYPED_1);

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
    expect(getTypedPropertyValue({ type: 'Extension', value: { valueBoolean: true } }, 'valueBoolean')).toStrictEqual({
      type: 'boolean',
      value: true,
    });
  });

  test('getTypedPropertyValueWithoutSchema', () => {
    expect(getTypedPropertyValueWithoutSchema({ type: '', value: undefined }, 'x')).toBeUndefined();
    expect(getTypedPropertyValueWithoutSchema({ type: '', value: null }, 'x')).toBeUndefined();
    expect(getTypedPropertyValueWithoutSchema({ type: 'x', value: {} }, 'x')).toBeUndefined();
    expect(getTypedPropertyValueWithoutSchema({ type: 'integer', value: 123 }, 'x')).toBeUndefined();

    // Support missing schemas
    expect(getTypedPropertyValueWithoutSchema({ type: 'Foo', value: { x: 1 } }, 'x')).toStrictEqual(TYPED_1);
    expect(getTypedPropertyValueWithoutSchema({ type: 'Foo', value: { x: [1] } }, 'x')).toStrictEqual([TYPED_1]);
    expect(getTypedPropertyValueWithoutSchema({ type: 'Foo', value: { valueInteger: 1 } }, 'value')).toStrictEqual(
      TYPED_1
    );
    expect(getTypedPropertyValueWithoutSchema({ type: 'Foo', value: { valueInteger: 1 } }, 'value[x]')).toStrictEqual(
      TYPED_1
    );

    // Only use valid property types
    expect(
      getTypedPropertyValueWithoutSchema(
        toTypedValue({ resourceType: 'Patient', identifier: [{ value: 'foo' }] }),
        'id'
      )
    ).toBeUndefined();
    expect(
      getTypedPropertyValueWithoutSchema(toTypedValue({ resourceType: 'AccessPolicy' }), 'resource')
    ).toBeUndefined();

    // Silently ignore empty arrays
    expect(
      getTypedPropertyValueWithoutSchema(toTypedValue({ resourceType: 'Patient', identifier: [] }), 'identifier')
    ).toBeUndefined();
    expect(getTypedPropertyValueWithoutSchema({ type: 'X', value: { x: [] } }, 'x')).toBeUndefined();

    // Property path that is part of multi-type element in schema
    expect(
      getTypedPropertyValueWithoutSchema({ type: 'Extension', value: { valueBoolean: true } }, 'valueBoolean')
    ).toStrictEqual({
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
    expect(getTypedPropertyValueWithSchema(typedValue, path, goodElement)).toStrictEqual({
      type: 'boolean',
      value: true,
    });

    const choiceOfTypeTypedValue: TypedValue = { type: 'Extension', value: { valueBoolean: true } };
    const extensionValueX: InternalSchemaElement = {
      description: '',
      path: 'Extension.value[x]',
      min: 1,
      max: 1,
      type: [{ code: 'boolean' }],
    };
    expect(getTypedPropertyValueWithSchema(choiceOfTypeTypedValue, 'value[x]', extensionValueX)).toStrictEqual({
      type: 'boolean',
      value: true,
    });
    expect(getTypedPropertyValueWithSchema(choiceOfTypeTypedValue, 'value', extensionValueX)).toStrictEqual({
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
    expect(humanName.given).toStrictEqual(expect.arrayContaining(['John', 'Johnny']));
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

    // Normalize date strings with time zone offsets
    expect(toPeriod('2020-01-01T12:34:56.000+01:00')).toMatchObject({
      start: '2020-01-01T11:34:56.000Z',
      end: '2020-01-01T11:34:56.000Z',
    });

    // Normalize periods with time zone offsets
    expect(toPeriod({ start: '2020-01-01T12:34:56.000+01:00', end: '2020-01-01T12:34:56.999+01:00' })).toMatchObject({
      start: '2020-01-01T11:34:56.000Z',
      end: '2020-01-01T11:34:56.999Z',
    });

    // Extend year to valid dates
    expect(toPeriod('2020')).toMatchObject({
      start: '2020-01-01T00:00:00.000Z',
      end: '2020-12-31T23:59:59.999Z',
    });
  });
});
