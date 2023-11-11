import { AsyncBackedClientStorage, ClientStorage, MemoryStorage } from '@medplum/core';
import { decode, encode } from 'base-64';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import expoWebCrypto from 'expo-standard-web-crypto';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import { TextDecoder, TextEncoder } from 'text-encoding';

export type ExtendedExpoCrypto = typeof expoWebCrypto & {
  subtle: {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
  };
};

export function polyfillMedplumWebAPIs(): void {
  if (typeof window.crypto?.subtle?.digest === 'undefined' || typeof window.crypto.getRandomValues === 'undefined') {
    // eslint-disable-next-line no-inner-declarations
    async function polyfilledDigest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
      return digest(algorithm as CryptoDigestAlgorithm, data);
    }

    Object.assign(expoWebCrypto, {
      subtle: { digest: polyfilledDigest },
    }) satisfies ExtendedExpoCrypto;

    Object.defineProperty(window, 'crypto', {
      configurable: true,
      enumerable: true,
      get: () => expoWebCrypto,
    });
  }

  if (typeof window.location === 'undefined') {
    setupURLPolyfill();
    const locationUrl = new URL('/', 'http://localhost') as URL & { assign: () => void };
    locationUrl.assign = () => {};
    Object.defineProperty(window, 'location', {
      value: locationUrl,
    });
  }

  let _sessionStorage: Storage;
  if (typeof window.sessionStorage === 'undefined') {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      enumerable: true,
      get: () => (_sessionStorage ??= new MemoryStorage()),
    });
  }

  if (typeof window.TextEncoder === 'undefined') {
    Object.defineProperty(window, 'TextEncoder', {
      configurable: true,
      enumerable: true,
      get: () => TextEncoder,
    });
  }

  if (typeof window.TextDecoder === 'undefined') {
    Object.defineProperty(window, 'TextDecoder', {
      configurable: true,
      enumerable: true,
      get: () => TextDecoder,
    });
  }

  if (typeof window.btoa === 'undefined') {
    Object.defineProperty(window, 'btoa', {
      configurable: true,
      enumerable: true,
      get: () => encode,
    });
  }

  if (typeof window.atob === 'undefined') {
    Object.defineProperty(window, 'atob', {
      configurable: true,
      enumerable: true,
      get: () => decode,
    });
  }
}

class SyncSecureStorage implements Storage {
  private readonly storage: Map<string, string>;
  private readonly initPromise: Promise<void>;
  private isInitialized = false;

  constructor() {
    this.storage = new Map<string, string>();
    this.initPromise = new Promise((resolve) => {
      // Fetch ::keys::
      SecureStore.getItemAsync('___keys___')
        .then((keysStr) => {
          if (!keysStr) {
            // No keys currently, just resolve
            this.isInitialized = true;
            resolve();
            return;
          }
          // Parse keys
          const keys = JSON.parse(keysStr) as string[];
          const promises = keys.map((key) => {
            return new Promise<[string, string | null]>((resolve) => {
              SecureStore.getItemAsync(key)
                .then((val) => {
                  resolve([key, val]);
                })
                .catch((err) => console.error(err));
            });
          });
          Promise.all(promises)
            .then((values) => {
              for (const [key, value] of values) {
                if (!value) {
                  continue;
                }
                this.storage.set(key, value);
                console.log(this.storage.get(key));
              }
              this.isInitialized = true;
              resolve();
            })
            .catch((err) => console.error(err));
        })
        .catch((err) => console.error(err));
    });
  }

  get initialized(): Promise<void> {
    return this.initPromise;
  }

  assertInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Not initialized!');
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
      this.removeItem(key);
    }
    // Clear map
    this.storage.clear();
  }

  private setKeys(): void {
    SecureStore.setItemAsync('___keys___', JSON.stringify(Array.from(this.storage.keys()))).catch((err) =>
      console.error(err)
    );
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
      SecureStore.setItemAsync(key, value).catch((err) => console.error(err));
      this.storage.set(key, value);
    }
    this.setKeys();
  }

  /**
   * Removes the key/value pair with the given key, if a key/value pair with the given key exists.
   * @param key - The storage key.
   */
  removeItem(key: string): void {
    this.assertInitialized();
    SecureStore.deleteItemAsync(key).catch((err) => console.error(err));
    this.storage.delete(key);
    this.setKeys();
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

export class ExpoClientStorage extends ClientStorage implements AsyncBackedClientStorage {
  // We keep a private reference to the storage we pass in so we can use it within this subclass too...
  private secureStorage: SyncSecureStorage;
  constructor() {
    const storage = new SyncSecureStorage();
    super(storage);
    this.secureStorage = storage;
  }
  get initialized(): Promise<void> {
    return this.secureStorage.initialized;
  }
}
