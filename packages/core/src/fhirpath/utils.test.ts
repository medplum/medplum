import { applyMaybeArray, fhirPathIs, toBoolean } from './utils';

describe('FHIRPath utils', () => {

  test('applyMaybeArray', () => {
    expect(applyMaybeArray(undefined, e => e)).toBeUndefined();
    expect(applyMaybeArray(123, e => e)).toEqual(123);
    expect(applyMaybeArray([1, 2, 3], e => e)).toEqual([1, 2, 3]);
    expect(applyMaybeArray([1, undefined, 3], e => e)).toEqual([1, 3]);
  });

  test('toBoolean', () => {
    expect(toBoolean(undefined)).toEqual(false);
    expect(toBoolean(null)).toEqual(false);
    expect(toBoolean(false)).toEqual(false);
    expect(toBoolean(true)).toEqual(true);
    expect(toBoolean('')).toEqual(false);
    expect(toBoolean('hi')).toEqual(true);
    expect(toBoolean([])).toEqual(false);
    expect(toBoolean(['hi'])).toEqual(true);
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
});
