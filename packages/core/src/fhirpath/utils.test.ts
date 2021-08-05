import { applyMaybeArray } from './utils';

describe('FHIRPath utils', () => {

  test('applyMaybeArray', () => {
    expect(applyMaybeArray(undefined, e => e)).toBeUndefined();
    expect(applyMaybeArray(123, e => e)).toEqual(123);
    expect(applyMaybeArray([1, 2, 3], e => e)).toEqual([1, 2, 3]);
    expect(applyMaybeArray([1, undefined, 3], e => e)).toEqual([1, 3]);
  });

});
