// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LRUCache } from './cache';

describe('Cache', () => {
  test('LRU', () => {
    const cache = new LRUCache<string>(3); // Create cache with capacity of 3
    cache.set('a', 'a');
    cache.set('b', 'b');
    cache.set('c', 'c');
    cache.set('d', 'd');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toStrictEqual('b');
    expect(cache.get('c')).toStrictEqual('c');
    expect(cache.get('d')).toStrictEqual('d');
  });

  test('Reordering', () => {
    const cache = new LRUCache<string>(3); // Create cache with capacity of 3
    cache.set('a', 'a');
    cache.set('b', 'b');
    cache.set('c', 'c');
    cache.get('a');
    cache.set('d', 'd');
    expect(cache.get('a')).toStrictEqual('a');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toStrictEqual('c');
    expect(cache.get('d')).toStrictEqual('d');
  });
});
