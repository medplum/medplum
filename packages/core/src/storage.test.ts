// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ClientStorage, MemoryStorage } from './storage';

describe('Storage', () => {
  test('Using localStorage', () => {
    const storage = new ClientStorage();

    storage.clear();
    expect(storage.getString('foo')).toBeUndefined();
    expect(storage.getObject('baz')).toBeUndefined();

    storage.setString('foo', 'bar');
    expect(storage.getString('foo')).toStrictEqual('bar');

    storage.setObject('baz', { name: 'Homer' });
    expect(storage.getObject('baz')).toMatchObject({ name: 'Homer' });

    storage.setString('foo', '');
    expect(storage.getString('foo')).toBeUndefined();

    storage.setObject('baz', null);
    expect(storage.getObject('baz')).toBeUndefined();
  });

  test('Using MemoryStorage', () => {
    const localStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined });

    const storage = new ClientStorage();

    storage.clear();
    expect(storage.getString('foo')).toBeUndefined();
    expect(storage.getObject('baz')).toBeUndefined();

    storage.setString('foo', 'bar');
    expect(storage.getString('foo')).toStrictEqual('bar');

    storage.setObject('baz', { name: 'Homer' });
    expect(storage.getObject('baz')).toMatchObject({ name: 'Homer' });

    storage.setString('foo', '');
    expect(storage.getString('foo')).toBeUndefined();

    storage.setObject('baz', null);
    expect(storage.getObject('baz')).toBeUndefined();

    Object.defineProperty(globalThis, 'localStorage', { value: localStorage });
  });

  test('Clearing should keep all non-prefixed keys intact when using localStorage', () => {
    const storage = new ClientStorage();

    localStorage.setItem('foo', 'bar');
    storage.setString('baz', 'qux');

    expect(localStorage.length).toStrictEqual(2);

    storage.clear();
    expect(localStorage.length).toStrictEqual(1);
  });

  test('getString/setString with default prefix (localStorage)', () => {
    const storage = new ClientStorage();

    // Initially undefined
    expect(storage.getString('testKey')).toBeUndefined();

    // Set a value
    storage.setString('testKey', 'testValue');
    expect(storage.getString('testKey')).toStrictEqual('testValue');
    expect(localStorage.getItem('@medplum:testKey')).toStrictEqual('testValue');

    // Update the value
    storage.setString('testKey', 'newValue');
    expect(storage.getString('testKey')).toStrictEqual('newValue');

    // Remove by setting to empty string
    storage.setString('testKey', '');
    expect(storage.getString('testKey')).toBeUndefined();
    expect(localStorage.getItem('@medplum:testKey')).toBeNull();

    // Remove by setting to undefined
    storage.setString('testKey2', 'value');
    storage.setString('testKey2', undefined);
    expect(storage.getString('testKey2')).toBeUndefined();
  });

  test('getString/setString without prefix (MemoryStorage)', () => {
    const localStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined });

    const storage = new ClientStorage();

    storage.setString('key1', 'value1');
    expect(storage.getString('key1')).toStrictEqual('value1');

    storage.setString('key1', '');
    expect(storage.getString('key1')).toBeUndefined();

    Object.defineProperty(globalThis, 'localStorage', { value: localStorage });
  });

  test('getObject/setObject with default prefix (localStorage)', () => {
    const storage = new ClientStorage();

    // Initially undefined
    expect(storage.getObject('user')).toBeUndefined();

    // Set an object
    const user = { id: '123', name: 'Alice', roles: ['admin', 'user'] };
    storage.setObject('user', user);
    expect(storage.getObject('user')).toMatchObject(user);
    expect(localStorage.getItem('@medplum:user')).toBeTruthy();

    // Update the object
    const updatedUser = { id: '123', name: 'Alice Updated' };
    storage.setObject('user', updatedUser);
    expect(storage.getObject('user')).toMatchObject(updatedUser);

    // Remove by setting to null
    storage.setObject('user', null);
    expect(storage.getObject('user')).toBeUndefined();

    // Complex nested object
    const complex = {
      level1: {
        level2: {
          level3: { value: 'deep' },
        },
        array: [1, 2, { nested: true }],
      },
    };
    storage.setObject('complex', complex);
    expect(storage.getObject('complex')).toMatchObject(complex);
  });

  test('getObject/setObject without prefix (MemoryStorage)', () => {
    const localStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined });

    const storage = new ClientStorage();

    const data = { key: 'value', nested: { prop: 123 } };
    storage.setObject('data', data);
    expect(storage.getObject('data')).toMatchObject(data);

    storage.setObject('data', null);
    expect(storage.getObject('data')).toBeUndefined();

    Object.defineProperty(globalThis, 'localStorage', { value: localStorage });
  });

  test('Clear using MemoryStorage', () => {
    const localStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined });

    const storage = new ClientStorage();
    storage.setString('key1', 'value1');
    storage.setString('key2', 'value2');

    expect(storage.getString('key1')).toStrictEqual('value1');
    expect(storage.getString('key2')).toStrictEqual('value2');

    storage.clear();
    expect(storage.getString('key1')).toBeUndefined();
    expect(storage.getString('key2')).toBeUndefined();

    Object.defineProperty(globalThis, 'localStorage', { value: localStorage });
  });
});

describe('MemoryStorage', () => {
  test('Get string', () => {
    const storage = new MemoryStorage();
    expect(storage.length).toStrictEqual(0);

    storage.setItem('foo', 'bar');
    expect(storage.getItem('foo')).toStrictEqual('bar');
    expect(storage.length).toStrictEqual(1);
    expect(storage.key(0)).toStrictEqual('foo');

    storage.setItem('foo', '');
    expect(storage.getItem('foo')).toBeNull();
    expect(storage.length).toStrictEqual(0);
  });
});
