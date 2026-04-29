// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { copyPaths, filterWithPaths, getPath, withPath, withPaths } from './withpath';

describe('withPath', () => {
  test('annotates an object with a path', () => {
    const obj = { a: 1 };
    const pathed = withPath(obj, 'foo');
    expect(getPath(pathed)).toBe('foo');
  });

  test('returns a clone, not the original', () => {
    const obj = { a: 1 };
    const pathed = withPath(obj, 'foo');
    expect(pathed).not.toBe(obj);
    expect(pathed.a).toBe(1);
  });

  test('preserves all existing properties', () => {
    const obj = { x: 'hello', y: 42, z: true };
    const pathed = withPath(obj, 'bar');
    expect(pathed).toMatchObject({ x: 'hello', y: 42, z: true });
  });

  test('path is not visible in normal enumeration', () => {
    const obj = { a: 1 };
    const pathed = withPath(obj, 'hidden');
    expect(Object.keys(pathed)).toEqual(['a']);
    expect(JSON.stringify(pathed)).toBe('{"a":1}');
  });

  test('overwrites a previous path when re-annotating', () => {
    const obj = { a: 1 };
    const first = withPath(obj, 'first');
    const second = withPath(first, 'second');
    expect(getPath(second)).toBe('second');
  });
});

describe('getPath', () => {
  test('returns the annotated path', () => {
    const pathed = withPath({}, 'Parameters[0]');
    expect(getPath(pathed)).toBe('Parameters[0]');
  });
});

describe('withPaths', () => {
  test('annotates each item with an indexed path', () => {
    const items = [{ v: 'a' }, { v: 'b' }, { v: 'c' }];
    const pathed = withPaths(items, 'Parameters');
    expect(getPath(pathed[0])).toBe('Parameters[0]');
    expect(getPath(pathed[1])).toBe('Parameters[1]');
    expect(getPath(pathed[2])).toBe('Parameters[2]');
  });

  test('returns clones, not originals', () => {
    const items = [{ v: 1 }];
    const pathed = withPaths(items, 'X');
    expect(pathed[0]).not.toBe(items[0]);
  });

  test('preserves item properties', () => {
    const items = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ];
    const pathed = withPaths(items, 'P');
    expect(pathed[0]).toMatchObject({ a: 1, b: 'x' });
    expect(pathed[1]).toMatchObject({ a: 2, b: 'y' });
  });

  test('returns an empty array for an empty input', () => {
    expect(withPaths([], 'P')).toEqual([]);
  });
});

describe('filterWithPaths', () => {
  test('includes only items matching the predicate', () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
    const pathed = filterWithPaths(items, (item) => item.n % 2 !== 0, 'P');
    expect(pathed).toHaveLength(2);
    expect(pathed[0].n).toBe(1);
    expect(pathed[1].n).toBe(3);
  });

  test('paths reflect original array indices, not filtered indices', () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
    const pathed = filterWithPaths(items, (item) => item.n % 2 !== 0, 'P');
    // item with n=1 is index 0, item with n=3 is index 2
    expect(getPath(pathed[0])).toBe('P[0]');
    expect(getPath(pathed[1])).toBe('P[2]');
  });

  test('returns an empty array when no items match', () => {
    const items = [{ n: 1 }, { n: 2 }];
    expect(filterWithPaths(items, () => false, 'P')).toEqual([]);
  });

  test('returns an empty array for undefined input', () => {
    expect(filterWithPaths(undefined, () => true, 'P')).toEqual([]);
  });

  test('preserves item properties', () => {
    const items = [
      { type: 'a', val: 1 },
      { type: 'b', val: 2 },
    ];
    const pathed = filterWithPaths(items, (item) => item.type === 'a', 'X');
    expect(pathed[0]).toMatchObject({ type: 'a', val: 1 });
  });

  test('works with a type-guard predicate', () => {
    type A = { kind: 'a'; x: number };
    type B = { kind: 'b'; y: string };
    const items: (A | B)[] = [
      { kind: 'a', x: 1 },
      { kind: 'b', y: 'hi' },
      { kind: 'a', x: 2 },
    ];
    const isA = (item: A | B): item is A => item.kind === 'a';
    const pathed = filterWithPaths(items, isA, 'Items');
    // Type is narrowed to WithPath<A>[]
    expect(pathed[0].x).toBe(1);
    expect(pathed[1].x).toBe(2);
    expect(getPath(pathed[0])).toBe('Items[0]');
    expect(getPath(pathed[1])).toBe('Items[2]');
  });
});

describe('copyPaths', () => {
  test('copies paths from sources to destinations', () => {
    const sources = [
      withPath({ s: 1 }, 'Path.first'),
      withPath({ s: 2 }, 'Item.two'),
      withPath({ s: 3 }, 'Thing.three'),
    ];
    const destinations = [{ d: 'a' }, { d: 'b' }, { d: 'c' }];
    const result = copyPaths(sources, destinations);
    expect(getPath(result[0])).toBe('Path.first');
    expect(getPath(result[1])).toBe('Item.two');
    expect(getPath(result[2])).toBe('Thing.three');
  });

  test('appends suffix when provided', () => {
    const sources = withPaths([{ s: 1 }, { s: 2 }], 'Items');
    const destinations = [{ d: 'a' }, { d: 'b' }];
    const result = copyPaths(sources, destinations, { suffix: '.name' });
    expect(getPath(result[0])).toBe('Items[0].name');
    expect(getPath(result[1])).toBe('Items[1].name');
  });

  test('no suffix by default', () => {
    const sources = withPaths([{ s: 1 }], 'Foo');
    const destinations = [{ d: 'x' }];
    const result = copyPaths(sources, destinations);
    expect(getPath(result[0])).toBe('Foo[0]');
  });

  test('preserves destination properties', () => {
    const sources = withPaths([{ s: 1 }, { s: 2 }], 'P');
    const destinations = [
      { x: 10, y: 'hello' },
      { x: 20, y: 'world' },
    ];
    const result = copyPaths(sources, destinations);
    expect(result[0]).toMatchObject({ x: 10, y: 'hello' });
    expect(result[1]).toMatchObject({ x: 20, y: 'world' });
  });

  test('returns an empty array for empty inputs', () => {
    expect(copyPaths([], [])).toEqual([]);
  });
});
