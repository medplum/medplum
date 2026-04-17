// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { invariant } from './invariant';

describe('invariant', () => {
  test('succeeds with a truthy condition', () => {
    expect(() => invariant(123)).not.toThrow();
  });

  test('throws with a falsey condition', () => {
    expect(() => invariant(undefined)).toThrow();
    expect(() => invariant(false)).toThrow();
    expect(() => invariant(0)).toThrow();
    expect(() => invariant(null)).toThrow();
  });

  test('can specify an error message', () => {
    expect(() => invariant(null)).toThrow('Invariant violation');
    expect(() => invariant(null, 'Something went wrong')).toThrow('Something went wrong');
  });

  test('refines types to exclude null and undefined values', () => {
    const testTypeRefinement = (value: number | undefined | null): number => {
      invariant(value);
      return value;
    };
    const result: number = testTypeRefinement(123);
    expect(result).toEqual(123);
  });
});
