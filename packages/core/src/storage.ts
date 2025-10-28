// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { stringify } from './utils';

export interface IClientStorage {
  getInitPromise?(): Promise<void>;
  clear(): void;
  getString(key: string): string | undefined;
  setString(key: string, value: string | undefined): void;
  getObject<T>(key: string): T | undefined;
  setObject<T>(key: string, value: T): void;
}

/**
 * A `Storage` that supports getting a list of all contained item keys via a `keys` method.
 *
 * Useful when you want to namespace your storage with the `prefix` feature of `ClientStorage`.
 */
export interface StorageWithKeys extends Storage {
  keys(): string[];
}

/**
 * @param storage - The Storage to test whether or not it supports the `keys` method.
 * @returns True if the Storage has a `keys` method, otherwise returns false.
 */
export function isStorageWithKeys(storage: Storage): storage is StorageWithKeys {
  return storage.keys && typeof storage.keys === 'function';
}

/**
 * The ClientStorage class is a utility class for storing strings and objects.
 *
 * When using MedplumClient in the browser, it will be backed by browser localStorage.
 *
 * When Using MedplumClient in the server, it will be backed by the MemoryStorage class.  For example, the Medplum CLI uses `FileSystemStorage`.
 */
export class ClientStorage implements IClientStorage {
  private readonly storage: Storage | StorageWithKeys;
  private readonly prefix: string = '';

  constructor(storage?: Storage | StorageWithKeys, prefix?: string) {
    if (!storage && typeof globalThis.localStorage !== 'undefined') {
      this.storage = globalThis.localStorage;
    } else if (!storage) {
      this.storage = new MemoryStorage();
    } else {
      this.storage = storage;
    }

    this.prefix = prefix ?? (this.storage === globalThis.localStorage ? '@medplum:' : '');
  }

  makeKey(key: string): string {
    return this.prefix + key;
  }

  clear(): void {
    // We clear differently for localStorage and for Storage types that specify a special 'keys' method
    // We will iterate through each item and check for our prefix
    // Otherwise if this storage is not localStorage or does not specify keys, then we just call clear on it
    if (!isStorageWithKeys(this.storage) && this.storage !== globalThis.localStorage) {
      this.storage.clear();
      return;
    }

    // The fallback here assumes this.storage is a Storage from the storage Class
    const keys = isStorageWithKeys(this.storage) ? this.storage.keys() : Object.keys(this.storage);
    keys
      .filter((key) => key.startsWith(this.prefix))
      .forEach((key) => {
        this.storage.removeItem(key);
      });
  }

  getString(key: string): string | undefined {
    return this.storage.getItem(this.makeKey(key)) ?? undefined;
  }

  setString(key: string, value: string | undefined): void {
    if (value) {
      this.storage.setItem(this.makeKey(key), value);
    } else {
      this.storage.removeItem(this.makeKey(key));
    }
  }

  getObject<T>(key: string): T | undefined {
    const str = this.getString(key);
    return str ? (JSON.parse(str) as T) : undefined;
  }

  setObject<T>(key: string, value: T): void {
    this.setString(key, value ? stringify(value) : undefined);
  }
}

/**
 * The MemoryStorage class is a minimal in-memory implementation of the Storage interface.
 */
export class MemoryStorage implements Storage {
  private readonly data: Map<string, string>;

  constructor() {
    this.data = new Map<string, string>();
  }

  /**
   * Returns the number of key/value pairs.
   * @returns The number of key/value pairs.
   */
  get length(): number {
    return this.data.size;
  }

  /**
   * Removes all key/value pairs, if there are any.
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Returns the current value associated with the given key, or null if the given key does not exist.
   * @param key - The specified storage key.
   * @returns The current value associated with the given key, or null if the given key does not exist.
   */
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  /**
   * Sets the value of the pair identified by key to value, creating a new key/value pair if none existed for key previously.
   * @param key - The storage key.
   * @param value - The new value.
   */
  setItem(key: string, value: string | null): void {
    if (value) {
      this.data.set(key, value);
    } else {
      this.data.delete(key);
    }
  }

  /**
   * Removes the key/value pair with the given key, if a key/value pair with the given key exists.
   * @param key - The storage key.
   */
  removeItem(key: string): void {
    this.data.delete(key);
  }

  /**
   * Returns the name of the nth key, or null if n is greater than or equal to the number of key/value pairs.
   * @param index - The numeric index.
   * @returns The nth key.
   */
  key(index: number): string | null {
    return Array.from(this.data.keys())[index];
  }
}

/**
 * The MockAsyncClientStorage class is a mock implementation of the ClientStorage class.
 * This can be used for testing async initialization of the MedplumClient.
 */
export class MockAsyncClientStorage extends ClientStorage implements IClientStorage {
  private initialized: boolean;
  private readonly initPromise: Promise<void>;
  private initResolve: () => void = () => undefined;

  constructor() {
    super();
    this.initialized = false;
    this.initPromise = new Promise((resolve) => {
      this.initResolve = resolve;
    });
  }

  setInitialized(): void {
    if (!this.initialized) {
      this.initResolve();
      this.initialized = true;
    }
  }

  getInitPromise(): Promise<void> {
    return this.initPromise;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}
