// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

describe('toEqualUnordered', () => {
  test('passes when arrays contain the same elements in different order', () => {
    expect([1, 2, 3]).toEqualUnordered([3, 1, 2]);
    expect([{ a: 1 }, { b: 2 }]).toEqualUnordered([{ b: 2 }, { a: 1 }]);
  });

  test('fails when lengths differ', () => {
    expect(() => expect([1, 2]).toEqualUnordered([1, 2, 3])).toThrow(/length/);
    expect(() => expect([1, 2, 3]).toEqualUnordered([1, 2])).toThrow(/length/);
  });

  test('counts duplicates correctly', () => {
    expect([1, 1, 2]).toEqualUnordered([1, 2, 1]);
    expect(() => expect([1, 1, 2]).toEqualUnordered([1, 2, 2])).toThrow();
  });

  test('fails when received is not an array', () => {
    expect(() => expect('not an array').toEqualUnordered([])).toThrow(/array/);
  });

  test('supports asymmetric matchers inside expected', () => {
    expect([
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
    ]).toEqualUnordered([expect.objectContaining({ name: 'b' }), expect.objectContaining({ name: 'a' })]);
  });

  test('passes empty against empty', () => {
    expect([]).toEqualUnordered([]);
  });

  test('works as an asymmetric matcher via expect.toEqualUnordered', () => {
    expect({ wrapper: { arr: [3, 1, 2] } }).toEqual({
      wrapper: { arr: expect.toEqualUnordered([1, 2, 3]) },
    });
  });

  test('asymmetric matcher fails when length differs', () => {
    expect(() => expect({ arr: [1, 2, 3, 4] }).toEqual({ arr: expect.toEqualUnordered([1, 2, 3]) })).toThrow();
  });

  test('negated form passes when arrays differ', () => {
    expect([1, 2, 3]).not.toEqualUnordered([1, 2, 4]);
    expect([1, 2]).not.toEqualUnordered([1, 2, 3]);
    expect('not an array').not.toEqualUnordered([]);
  });

  test('negated form fails when arrays match unordered', () => {
    expect(() => expect([1, 2, 3]).not.toEqualUnordered([3, 1, 2])).toThrow(/not to equal/);
  });

  test('failure message includes expected and received arrays', () => {
    expect(() => expect([1, 2, 3]).toEqualUnordered([1, 2, 4])).toThrow(/Expected[\s\S]*Received/);
  });

  test('inverse asymmetric matcher passes when arrays differ', () => {
    expect({ arr: [1, 2, 3] }).toEqual({ arr: expect.not.toEqualUnordered([1, 2, 4]) });
  });

  test('inverse asymmetric matcher fails when arrays match unordered', () => {
    expect(() => expect({ arr: [3, 1, 2] }).toEqual({ arr: expect.not.toEqualUnordered([1, 2, 3]) })).toThrow();
  });
});
