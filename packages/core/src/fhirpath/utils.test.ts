import { applyMaybeArray, fhirPathEquals, fhirPathIs, toJsBoolean } from './utils';

describe('FHIRPath utils', () => {
  test('applyMaybeArray', () => {
    expect(applyMaybeArray(undefined, (e) => e)).toBeUndefined();
    expect(applyMaybeArray(123, (e) => e)).toEqual(123);
    expect(applyMaybeArray([1, 2, 3], (e) => e)).toEqual([1, 2, 3]);
    expect(applyMaybeArray([1, undefined, 3], (e) => e)).toEqual([1, 3]);
  });

  test('toJsBoolean', () => {
    expect(toJsBoolean(undefined)).toEqual(false);
    expect(toJsBoolean(null)).toEqual(false);
    expect(toJsBoolean(false)).toEqual(false);
    expect(toJsBoolean(true)).toEqual(true);
    expect(toJsBoolean('')).toEqual(false);
    expect(toJsBoolean('hi')).toEqual(true);
    expect(toJsBoolean([])).toEqual(false);
    expect(toJsBoolean(['hi'])).toEqual(true);
  });

  test('fhirPathIs', () => {
    expect(fhirPathIs(undefined, 'string')).toEqual(false);
    expect(fhirPathIs({}, 'Patient')).toEqual(false);
    expect(fhirPathIs({ resourceType: 'Patient' }, 'Patient')).toEqual(true);
    expect(fhirPathIs({ resourceType: 'Observation' }, 'Patient')).toEqual(false);
    expect(fhirPathIs(true, 'Boolean')).toEqual(true);
    expect(fhirPathIs(false, 'Boolean')).toEqual(true);
    expect(fhirPathIs(100, 'Boolean')).toEqual(false);
    expect(fhirPathIs({}, 'Boolean')).toEqual(false);
  });

  test('fhirPathEquals', () => {
    expect(fhirPathEquals(1, 1)).toEqual(true);
    expect(fhirPathEquals(1, 2)).toEqual(false);
    expect(fhirPathEquals(2, 1)).toEqual(false);
  });
});
