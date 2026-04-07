// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { flatMapMax } from './array';

describe('flatMapMax', () => {
  test('iterates only until `count` entries have been generated', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const cb = jest.fn(() => [0, 1, 2, 3, 4, 5]);
    flatMapMax(arr, cb, 8);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('truncates lists from the mapper when it does not respect the count option', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const cb = (): number[] => [0, 1, 2, 3, 4, 5];
    expect(flatMapMax(arr, cb, 8)).toHaveLength(8);
  });

  test('handles a mix of single items and lists returned from the mapper', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const cb = (_item: string, idx: number): number | number[] => (idx % 2 === 0 ? [0, 1, 2, 3, 4, 5] : 6);
    expect(flatMapMax(arr, cb, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 0]);
  });

  test('only flattens one level', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const cb = (): [number, string][] => [
      [0, 'a'],
      [1, 'b'],
    ];
    expect(flatMapMax(arr, cb, 3)).toEqual([
      [0, 'a'],
      [1, 'b'],
      [0, 'a'],
    ]);
  });

  test('passes the remaining count to the mapper', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const cb = jest.fn(() => [0, 1, 2, 3, 4]);
    flatMapMax(arr, cb, 8);
    expect(cb).toHaveBeenNthCalledWith(1, 'a', 0, 8);
    expect(cb).toHaveBeenNthCalledWith(2, 'b', 1, 3);
  });
});
