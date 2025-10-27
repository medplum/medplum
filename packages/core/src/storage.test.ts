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
    const localStorage = global.localStorage;
    Object.defineProperty(window, 'localStorage', { value: undefined });

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

    Object.defineProperty(window, 'localStorage', { value: localStorage });
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
