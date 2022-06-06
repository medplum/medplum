import { PropertyType } from '../types';
import { fhirPathEquals, fhirPathIs, toJsBoolean } from './utils';

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
    expect(fhirPathEquals(TYPED_1, TYPED_1)).toEqual([TYPED_TRUE]);
    expect(fhirPathEquals(TYPED_1, TYPED_2)).toEqual([TYPED_FALSE]);
    expect(fhirPathEquals(TYPED_2, TYPED_1)).toEqual([TYPED_FALSE]);
  });
});
