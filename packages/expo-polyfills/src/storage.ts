import { ClientStorage, IClientStorage, OperationOutcomeError } from '@medplum/core';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface IExpoClientStorage extends IClientStorage {
  getInitPromise(): Promise<void>;
  length: number;
}

/**
 * Provides a wrapper around Expo's `SecureStore` package which provides a persistent and secure storage on mobile.
 *
 * This class is necessary for use with `MedplumClient` since `MedplumClient` expects `ClientStorage` to use a synchronous interface, and `SecureStore` uses an asynchronous one.
 *
 * On web, this class will instead wrap `localStorage` automatically, so there is no need to conditionally omit passing this to `MedplumClient` for React Native Web.
 */
export class ExpoClientStorage extends ClientStorage implements IExpoClientStorage {
  // We keep a private reference to the storage we pass in so we can use it within this subclass too...
  private secureStorage?: SyncSecureStorage;
  constructor() {
    // Metro should automatically prune these branches out at compile time
    if (Platform.OS === 'web') {
      super(globalThis.localStorage);
    } else {
      const storage = new SyncSecureStorage();
      super(storage);
      this.secureStorage = storage;
    }
  }
  getInitPromise(): Promise<void> {
    if (Platform.OS === 'web') {
      return Promise.resolve();
    }
    return (this.secureStorage as SyncSecureStorage).getInitPromise();
  }
  get length(): number {
    if (Platform.OS === 'web') {
      return globalThis.localStorage.length;
    }
    return (this.secureStorage as SyncSecureStorage).length;
  }
}

/**
 * This is an internal `Storage` implementation that is used by `ExpoClientStorage`.
 *
 * In general, this class should not be used outside of `ExpoClientStorage`.
 *
 * @internal
 */
export class SyncSecureStorage implements Storage {
  private readonly storage: Map<string, string>;
  private readonly initPromise: Promise<void>;
  private initialized = false;

  constructor() {
    this.storage = new Map<string, string>();
    this.initPromise = this.initStorage();
  }

  private async initStorage(): Promise<void> {
    let keysStr: string | null;
    try {
      // We can't just get all the "keys" that currently exist as there is no such concept
      // We need to instead store all keys we intend to restore later in a known key
      // We've chose `___keys___` to prevent collisions
      // Here we get the keys and attempt to restore them
      keysStr = await SecureStore.getItemAsync('___keys___');
    } catch (err: unknown) {
      // If an error is thrown here, it's likely an issue with encryption...
      // We may be unable to decrypt existing keys if the keystore itself has changed
      // In that case we should dump the keys and start fresh
      // We can just initialize and resolve the `initPromise`
      console.error(err);
      await SecureStore.deleteItemAsync('___keys___');
      this.initialized = true;
      return;
    }
    if (!keysStr) {
      this.initialized = true;
      return;
    }
    const keys = JSON.parse(keysStr) as string[];
    await this.buildMapFromStoredKeys(keys);
    this.initialized = true;
  }

  private async buildMapFromStoredKeys(keys: string[]): Promise<void> {
    const promises = keys.map((key) => SecureStore.getItemAsync(key));
    const values = await Promise.all(promises);
    for (let i = 0; i < keys.length; i++) {
      const val = values[i];
      if (!val) {
        continue;
      }
      this.storage.set(keys[i], val);
    }
  }

  getInitPromise(): Promise<void> {
    return this.initPromise;
  }

  assertInitialized(): void {
    if (!this.initialized) {
      throw new OperationOutcomeError({
        id: 'not-initialized',
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            details: {
              text: 'Not initialized',
            },
            diagnostics: 'Storage not initialized',
          },
        ],
      });
    }
  }

  get length(): number {
    this.assertInitialized();
    return this.storage.size;
  }

  /**
   * Clears the storage and sets keys.
   */
  clear(): void {
    this.assertInitialized();
    // Start clearing out each key in background
    for (const key of this.storage.keys()) {
      this.removeItem(key, false);
    }
    // Clear map
    this.storage.clear();
    this.setKeys();
  }

  private setKeys(): void {
    SecureStore.setItemAsync('___keys___', JSON.stringify(Array.from(this.storage.keys()))).catch(console.error);
  }

  /**
   * Returns the current value associated with the given key, or null if the given key does not exist.
   * @param key - The specified storage key.
   * @returns The current value associated with the given key, or null if the given key does not exist.
   */
  getItem(key: string): string | null {
    this.assertInitialized();
    return this.storage.get(key) ?? null;
  }

  /**
   * Sets the value of the pair identified by key to value, creating a new key/value pair if none existed for key previously.
   * @param key - The storage key.
   * @param value - The new value.
   */
  setItem(key: string, value: string | null): void {
    this.assertInitialized();
    // Set key in background, or delete it if the value is null
    if (!value) {
      this.removeItem(key);
    } else {
      SecureStore.setItemAsync(key, value).catch(console.error);
      this.storage.set(key, value);
    }
    this.setKeys();
  }

  /**
   * Removes the key/value pair with the given key, if a key/value pair with the given key exists.
   * @param key - The storage key.
   * @param setKeys - Whether to call `this.setKeys()` after deleting the key. Defaults to `true`.
   */
  removeItem(key: string, setKeys = true): void {
    this.assertInitialized();
    SecureStore.deleteItemAsync(key).catch(console.error);
    this.storage.delete(key);
    if (setKeys) {
      this.setKeys();
    }
  }

  /**
   * This is a stub. Returns `null`.
   * @param _index - The numeric index. Ignored.
   * @returns `null`.
   */
  key(_index: number): string | null {
    this.assertInitialized();
    return null;
  }
}
