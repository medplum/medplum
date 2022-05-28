import { applyMaybeArray, calculateAge, fhirPathEquals, fhirPathIs, toJsBoolean } from './utils';

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

  test('Calculate age', () => {
    expect(calculateAge(new Date().toISOString().substring(0, 10))).toMatchObject({ years: 0, months: 0, days: 0 });
    expect(calculateAge('2020-01-01', '2020-01-01')).toMatchObject({ years: 0, months: 0, days: 0 });
    expect(calculateAge('2020-01-01', '2020-01-02')).toMatchObject({ years: 0, months: 0, days: 1 });
    expect(calculateAge('2020-01-01', '2020-02-01')).toMatchObject({ years: 0, months: 1 });
    expect(calculateAge('2020-01-01', '2020-02-02')).toMatchObject({ years: 0, months: 1 });
    expect(calculateAge('2020-01-01', '2020-03-01')).toMatchObject({ years: 0, months: 2 });
    expect(calculateAge('2020-01-01', '2020-03-02')).toMatchObject({ years: 0, months: 2 });
    expect(calculateAge('2020-01-01', '2021-01-01')).toMatchObject({ years: 1, months: 12 });
    expect(calculateAge('2020-01-01', '2021-01-02')).toMatchObject({ years: 1, months: 12 });
    expect(calculateAge('2020-01-01', '2021-02-01')).toMatchObject({ years: 1, months: 13 });
    expect(calculateAge('2020-01-01', '2021-02-02')).toMatchObject({ years: 1, months: 13 });

    // End month < start month
    expect(calculateAge('2020-06-01', '2022-05-01')).toMatchObject({ years: 1, months: 23 });

    // End day < start day
    expect(calculateAge('2020-06-30', '2022-06-29')).toMatchObject({ years: 1, months: 23 });
  });
});
