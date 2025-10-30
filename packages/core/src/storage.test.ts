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

  test('Clearing should keep all non-prefixed keys intact when using localStorage with prefix', () => {
    localStorage.clear();
    const storage = new ClientStorage(undefined, '@medplum:');

    localStorage.setItem('foo', 'bar');
    storage.setString('baz', 'qux');

    expect(localStorage.length).toStrictEqual(2);

    storage.clear();
    expect(localStorage.length).toStrictEqual(1);
  });

  test('getString/setString without prefix (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage();

    // Initially undefined
    expect(storage.getString('testKey')).toBeUndefined();

    // Set a value
    storage.setString('testKey', 'testValue');
    expect(storage.getString('testKey')).toStrictEqual('testValue');
    // With no prefix, key is stored directly
    expect(localStorage.getItem('testKey')).toStrictEqual('testValue');

    // Update the value
    storage.setString('testKey', 'newValue');
    expect(storage.getString('testKey')).toStrictEqual('newValue');

    // Remove by setting to empty string
    storage.setString('testKey', '');
    expect(storage.getString('testKey')).toBeUndefined();
    expect(localStorage.getItem('testKey')).toBeNull();

    // Remove by setting to undefined
    storage.setString('testKey2', 'value');
    storage.setString('testKey2', undefined);
    expect(storage.getString('testKey2')).toBeUndefined();
  });

  test('getString/setString (MemoryStorage)', () => {
    const localStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined });

    const storage = new ClientStorage();

    storage.setString('key1', 'value1');
    expect(storage.getString('key1')).toStrictEqual('value1');

    storage.setString('key1', '');
    expect(storage.getString('key1')).toBeUndefined();

    Object.defineProperty(globalThis, 'localStorage', { value: localStorage });
  });

  test('getObject/setObject without prefix (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage();

    // Initially undefined
    expect(storage.getObject('user')).toBeUndefined();

    // Set an object
    const user = { id: '123', name: 'Alice', roles: ['admin', 'user'] };
    storage.setObject('user', user);
    expect(storage.getObject('user')).toMatchObject(user);
    // With no prefix, key is stored directly
    expect(localStorage.getItem('user')).toBeTruthy();

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

  test('getObject/setObject (MemoryStorage)', () => {
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

  test('getString/setString with @medplum: prefix (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage(undefined, '@medplum:');

    storage.setString('key1', 'value1');
    expect(storage.getString('key1')).toStrictEqual('value1');
    expect(localStorage.getItem('@medplum:key1')).toStrictEqual('value1');

    storage.setString('key1', '');
    expect(storage.getString('key1')).toBeUndefined();
    expect(localStorage.getItem('@medplum:key1')).toBeNull();
  });

  test('getString/setString with custom prefix (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage(undefined, '@custom:');

    storage.setString('key1', 'value1');
    expect(storage.getString('key1')).toStrictEqual('value1');
    expect(localStorage.getItem('@custom:key1')).toStrictEqual('value1');

    // Verify @medplum: prefix is not used
    expect(localStorage.getItem('@medplum:key1')).toBeNull();

    storage.setString('key1', '');
    expect(storage.getString('key1')).toBeUndefined();
    expect(localStorage.getItem('@custom:key1')).toBeNull();
  });

  test('getObject/setObject with @medplum: prefix (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage(undefined, '@medplum:');

    const user = { id: '456', name: 'Bob' };
    storage.setObject('user', user);
    expect(storage.getObject('user')).toMatchObject(user);
    expect(localStorage.getItem('@medplum:user')).toBeTruthy();

    storage.setObject('user', null);
    expect(storage.getObject('user')).toBeUndefined();
  });

  test('getObject/setObject with custom prefix (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage(undefined, '@app:');

    const config = { theme: 'dark', language: 'en' };
    storage.setObject('config', config);
    expect(storage.getObject('config')).toMatchObject(config);
    expect(localStorage.getItem('@app:config')).toBeTruthy();

    // Verify prefix isolation - unprefixed storage can't access it
    const unprefixedStorage = new ClientStorage();
    expect(unprefixedStorage.getObject('config')).toBeUndefined();

    storage.setObject('config', null);
    expect(storage.getObject('config')).toBeUndefined();
  });

  test('getString/setString with empty prefix (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage(undefined, '');

    storage.setString('key', 'value');
    expect(storage.getString('key')).toStrictEqual('value');
    // With empty prefix, key should be stored without any prefix
    expect(localStorage.getItem('key')).toStrictEqual('value');

    storage.setString('key', '');
    expect(storage.getString('key')).toBeUndefined();
  });

  test('Clear with custom prefix keeps non-prefixed keys intact (localStorage)', () => {
    localStorage.clear();
    const storage = new ClientStorage(undefined, '@test:');

    localStorage.setItem('foo', 'bar');
    storage.setString('baz', 'qux');

    expect(localStorage.length).toStrictEqual(2);
    expect(localStorage.getItem('@test:baz')).toStrictEqual('qux');
    expect(storage.getString('baz')).toStrictEqual('qux');

    storage.clear();
    expect(localStorage.length).toStrictEqual(1);
    expect(localStorage.getItem('foo')).toStrictEqual('bar');
    expect(storage.getString('baz')).toBeUndefined();
  });

  test('Multiple instances with different prefixes do not interfere (localStorage)', () => {
    localStorage.clear();
    const storage1 = new ClientStorage(undefined, '@app1:');
    const storage2 = new ClientStorage(undefined, '@app2:');

    storage1.setString('key', 'value1');
    storage2.setString('key', 'value2');

    expect(storage1.getString('key')).toStrictEqual('value1');
    expect(storage2.getString('key')).toStrictEqual('value2');
    expect(localStorage.getItem('@app1:key')).toStrictEqual('value1');
    expect(localStorage.getItem('@app2:key')).toStrictEqual('value2');

    storage1.clear();
    expect(storage1.getString('key')).toBeUndefined();
    expect(storage2.getString('key')).toStrictEqual('value2');
  });

  test('Prefix is ignored when using MemoryStorage', () => {
    const localStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined });

    // Even with a prefix specified, MemoryStorage ignores it (no keys() method)
    const storage = new ClientStorage(undefined, '@test:');
    storage.setString('key1', 'value1');
    storage.setString('key2', 'value2');

    expect(storage.getString('key1')).toStrictEqual('value1');
    expect(storage.getString('key2')).toStrictEqual('value2');

    // Clear will clear ALL items since MemoryStorage doesn't support selective clearing
    storage.clear();
    expect(storage.getString('key1')).toBeUndefined();
    expect(storage.getString('key2')).toBeUndefined();

    Object.defineProperty(globalThis, 'localStorage', { value: localStorage });
  });

  test('Prefix is ignored when using custom storage', () => {
    const memStore = new MemoryStorage();
    const storage = new ClientStorage(memStore, '@custom:');

    // Set items directly on the backing store
    memStore.setItem('external', 'value');

    // Set items through ClientStorage
    storage.setString('internal', 'data');

    // Both should be accessible through ClientStorage (prefix ignored)
    expect(storage.getString('internal')).toStrictEqual('data');

    // Verify backing store has both items
    expect(memStore.length).toStrictEqual(2);

    // Clear will clear ALL items since MemoryStorage doesn't have keys() method
    storage.clear();
    expect(memStore.length).toStrictEqual(0);
    expect(storage.getString('internal')).toBeUndefined();
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
