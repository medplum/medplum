// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { arrayify } from './array';

describe('arrayify', () => {
  test('single objects get array wrapped', () => {
    expect(arrayify(0)).toEqual([0]);
    expect(arrayify({ resourceType: 'Patient', id: 'abc' })).toEqual([{ resourceType: 'Patient', id: 'abc' }]);
  });

  test('arrays are returned as-is', () => {
    const arr = [true];
    expect(arrayify(arr)).toBe(arr);

    const empty: never[] = [];
    expect(arrayify(empty)).toBe(empty);
  });

  test('undefined is returned as-is', () => {
    expect(arrayify(undefined)).toBe(undefined);
  });

  test('typescript does not introduce undefined in the result type when it is not in the input type', () => {
    const a: number[] = [1, 2, 3];
    const b: number[] = arrayify(a);
    expect(b).toEqual([1, 2, 3]);
  });
});
