// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ClientStorage, MemoryStorage } from './storage';

class TestStorage implements Storage {
  private readonly items = new Map<string, string>();
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  clear(): void {
    this.items.clear();
  }
  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return this.keys()[index] ?? null;
  }
  keys(): string[] {
    return Array.from(this.items.keys());
  }
}

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

  test('Clearing should keep non-prefixed keys intact when prefix present', () => {
    const store = new TestStorage();
    const storage = new ClientStorage(store, '@test:');

    store.setItem('foo', 'bar');
    storage.setString('baz', 'qux');

    expect(store.length).toStrictEqual(2);

    storage.clear();
    expect(store.length).toStrictEqual(1);
    expect(store.getItem('foo')).toStrictEqual('bar');
  });

  test('Clearing should keep all non-prefixed keys intact when using localStorage', () => {
    const storage = new ClientStorage();

    localStorage.setItem('foo', 'bar');
    storage.setString('baz', 'qux');

    expect(localStorage.length).toStrictEqual(2);

    storage.clear();
    expect(localStorage.length).toStrictEqual(1);
  });

  test('Clearing should clear all keys when no keys method on storage', () => {
    const store = new MemoryStorage();
    const storage = new ClientStorage(store, '@test:');

    store.setItem('foo', 'bar');
    storage.setString('baz', 'qux');

    expect(store.length).toStrictEqual(2);

    storage.clear();
    expect(store.length).toStrictEqual(0);
  });

  test('Should allow a custom prefix when using localStorage', () => {
    // Use `undefined` so `localStorage` is used as backing store
    const storage = new ClientStorage(undefined, '@test:');

    localStorage.setItem('foo', 'bar');
    storage.setString('baz', 'qux');

    expect(localStorage.length).toStrictEqual(2);
    expect(localStorage.getItem('@test:baz')).toStrictEqual('qux');
    expect(storage.getString('baz')).toStrictEqual('qux');

    storage.clear();
    expect(localStorage.length).toStrictEqual(1);
    expect(localStorage.getItem('foo')).toStrictEqual('bar');
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

  test('getString/setString with custom prefix', () => {
    const storage = new ClientStorage(undefined, '@custom:');

    storage.setString('key1', 'value1');
    expect(storage.getString('key1')).toStrictEqual('value1');
    expect(localStorage.getItem('@custom:key1')).toStrictEqual('value1');

    // Verify prefix isolation
    expect(localStorage.getItem('@medplum:key1')).toBeNull();
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

  test('getObject/setObject with custom prefix', () => {
    const storage = new ClientStorage(undefined, '@app:');

    const config = { theme: 'dark', language: 'en' };
    storage.setObject('config', config);
    expect(storage.getObject('config')).toMatchObject(config);
    expect(localStorage.getItem('@app:config')).toBeTruthy();

    // Verify prefix isolation
    const defaultStorage = new ClientStorage();
    expect(defaultStorage.getObject('config')).toBeUndefined();
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

  test('getString/setString with explicit empty prefix', () => {
    const storage = new ClientStorage(undefined, '');

    storage.setString('key', 'value');
    expect(storage.getString('key')).toStrictEqual('value');
    // With empty prefix, key should be stored without prefix
    expect(localStorage.getItem('key')).toStrictEqual('value');
  });

  test('getObject/setObject with explicit empty prefix', () => {
    const storage = new ClientStorage(undefined, '');

    const obj = { test: 'data' };
    storage.setObject('obj', obj);
    expect(storage.getObject('obj')).toMatchObject(obj);
    // With empty prefix, key should be stored without prefix
    expect(localStorage.getItem('obj')).toBeTruthy();
  });

  test('Multiple instances with different prefixes should not interfere', () => {
    const storage1 = new ClientStorage(undefined, '@app1:');
    const storage2 = new ClientStorage(undefined, '@app2:');

    storage1.setString('key', 'value1');
    storage2.setString('key', 'value2');

    expect(storage1.getString('key')).toStrictEqual('value1');
    expect(storage2.getString('key')).toStrictEqual('value2');

    storage1.clear();
    expect(storage1.getString('key')).toBeUndefined();
    expect(storage2.getString('key')).toStrictEqual('value2');
  });

  test('Clear with different prefixes using MemoryStorage', () => {
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
