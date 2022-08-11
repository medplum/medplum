import { PropertyType } from '../types';
import {
  fhirPathArrayEquals,
  fhirPathArrayEquivalent,
  fhirPathEquals,
  fhirPathEquivalent,
  fhirPathIs,
  getTypedPropertyValue,
  toJsBoolean,
  toTypedValue,
} from './utils';

const TYPED_TRUE = { type: PropertyType.boolean, value: true };
const TYPED_FALSE = { type: PropertyType.boolean, value: false };
const TYPED_1 = { type: PropertyType.integer, value: 1 };
const TYPED_2 = { type: PropertyType.integer, value: 2 };

describe('FHIRPath utils', () => {
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
  });
});
