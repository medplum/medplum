// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { Bundle, Period, Questionnaire } from '@medplum/fhirtypes';
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
    const primitiveValue = 'Johnny';
    const primitiveExtension = { url: 'http://example.com', valueBoolean: true };
    const humanName = {
      given: ['John', primitiveValue],
      _given: [null, { extension: [primitiveExtension] }],
    };

    const elementSchema: InternalSchemaElement = {
      description: '',
      path: 'HumanName.given',
      min: 0,
      max: 2,
      isArray: true,
      type: [{ code: 'string' }],
    };

    // Extract elements with and without primitive extensions
    const results = getTypedPropertyValueWithSchema({ type: 'HumanName', value: humanName }, 'given', elementSchema);

    expect(results).toHaveLength(2);
    const [simple, extended] = results as TypedValue[];
    expect(simple).toStrictEqual({ type: 'string', value: 'John' });
    expect(extended).toStrictEqual({
      type: 'string',
      value: expect.objectContaining(Object.assign('', primitiveValue, { extension: [primitiveExtension] })),
    });

    // Check that values look correct when access "normally"
    expect(extended.value.valueOf()).toBe('Johnny');
    expect(extended.value.extension).toStrictEqual([primitiveExtension]);

    // With primitive extensions, array values can be changed into a `String` wrapper type which has a typeof 'object';
    // need to ensure the original input array values are not mutated as such
    expect(humanName.given.every((g) => typeof g === 'string')).toBe(true);

    // If extension only is specified, should still extract
    const results2 = getTypedPropertyValueWithSchema(
      { type: 'HumanName', value: { _given: [{ extension: [primitiveExtension] }] } },
      'given',
      elementSchema
    );
    expect(results2).toHaveLength(1);
    const [extensionOnly] = results2 as TypedValue[];
    expect(extensionOnly).toStrictEqual({
      type: 'string',
      value: expect.objectContaining(Object.assign('', { extension: [primitiveExtension] })),
    });
  });

  test.each<[any, boolean]>([
    [undefined, false],
    [null, false],
    ['', false],
    ['x', false],
    ['2020', true],
    ['2020-01', true],
    ['2020-01-01', true],
    ['2020-01-01T12:34:56Z', false],
    ['2020-01-01T12:34:56.789Z', false],
  ])('isDateString', (input, expected) => {
    expect(isDateString(input)).toBe(expected);
  });

  test.each<[any, boolean]>([
    [undefined, false],
    [null, false],
    ['', false],
    ['x', false],
    ['2020', true],
    ['2020-01', true],
    ['2020-01-01', true],
    ['2020-01-01T12:34:56Z', true],
    ['2020-01-01T12:34:56.7Z', true],
    ['2020-01-01T12:34:56.789Z', true],
    ['2020-01-01T12:34:56+01:30', true],
    ['2020-01-01T12:34:56.7+01:30', true],
    ['2020-01-01T12:34:56.789+01:30', true],
  ])('isDateTimeString(%p)', (input, expected) => {
    expect(isDateTimeString(input)).toBe(expected);
  });

  test.each<[any, Period | undefined]>([
    [undefined, undefined],
    [null, undefined],
    ['', undefined],
    ['x', undefined],
    [{}, undefined],
    ['2020-01-01', { start: '2020-01-01T00:00:00.000Z', end: '2020-01-01T23:59:59.999Z' }],
    ['2025-05-25T15:55:55Z', { start: '2025-05-25T15:55:55.000Z', end: '2025-05-25T15:55:55.999Z' }],
    ['2025-05-25T15:55:55.7Z', { start: '2025-05-25T15:55:55.700Z', end: '2025-05-25T15:55:55.799Z' }],
    ['2020-01-01T12:34:56.000Z', { start: '2020-01-01T12:34:56.000Z', end: '2020-01-01T12:34:56.000Z' }],
    ['2025-05-25T15:55:55+01:30', { start: '2025-05-25T14:25:55.000Z', end: '2025-05-25T14:25:55.999Z' }],
    ['2025-05-25T15:55:55.7+01:30', { start: '2025-05-25T14:25:55.700Z', end: '2025-05-25T14:25:55.799Z' }],
    ['2020-01-01T12:34:56.000+01:30', { start: '2020-01-01T11:04:56.000Z', end: '2020-01-01T11:04:56.000Z' }],
    [
      { start: '2020-01-01T12:34:56.000Z', end: '2020-01-01T12:34:56.999Z' },
      { start: '2020-01-01T12:34:56.000Z', end: '2020-01-01T12:34:56.999Z' },
    ],
    // Normalize date strings with time zone offsets
    ['2020-01-01T12:34:56.000+01:00', { start: '2020-01-01T11:34:56.000Z', end: '2020-01-01T11:34:56.000Z' }],
    // Normalize periods with time zone offsets
    [
      { start: '2020-01-01T12:34:56.000+01:00', end: '2020-01-01T12:34:56.999+01:00' },
      { start: '2020-01-01T11:34:56.000Z', end: '2020-01-01T11:34:56.999Z' },
    ],
    // Extend year to valid dates
    ['2020', { start: '2020-01-01T00:00:00.000Z', end: '2020-12-31T23:59:59.999Z' }],
  ])('toPeriod(%p)', (input, expected) => {
    if (expected) {
      expect(toPeriod(input)).toMatchObject(expected);
    } else {
      expect(toPeriod(input)).toBeUndefined();
    }
  });
});
