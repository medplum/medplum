import { MemoryStorage } from '@medplum/core';
import { decode, encode } from 'base-64';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import expoWebCrypto from 'expo-standard-web-crypto';
import 'react-native-url-polyfill/auto';
import { TextEncoder } from 'text-encoding';

type ExtendedExpoCrypto = typeof expoWebCrypto & {
  subtle: {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
  };
};

export function polyfillMedplumWebAPIs(): void {
  if (typeof window.crypto === 'undefined') {
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
    const locationUrl = new URL('/', 'http://localhost:80') as URL & { assign: () => void };
    locationUrl.assign = () => {};
    Object.defineProperty(window, 'location', {
      value: locationUrl,
    });
  }

  let _sessionStorage: Storage;
  if (typeof window.sessionStorage === 'undefined') {
    // /**
    //  * The MemoryStorage class is a minimal in-memory implementation of the Storage interface.
    //  */
    // class MemoryStorage implements Storage {
    //   private data: Map<string, string>;

    //   constructor() {
    //     this.data = new Map<string, string>();
    //   }

    //   /**
    //    * Returns the number of key/value pairs.
    //    * @returns The number of key/value pairs.
    //    */
    //   get length(): number {
    //     return this.data.size;
    //   }

    //   /**
    //    * Removes all key/value pairs, if there are any.
    //    */
    //   clear(): void {
    //     this.data.clear();
    //   }

    //   /**
    //    * Returns the current value associated with the given key, or null if the given key does not exist.
    //    * @param key - The specified storage key.
    //    * @returns The current value associated with the given key, or null if the given key does not exist.
    //    */
    //   getItem(key: string): string | null {
    //     return this.data.get(key) ?? null;
    //   }

    //   /**
    //    * Sets the value of the pair identified by key to value, creating a new key/value pair if none existed for key previously.
    //    * @param key - The storage key.
    //    * @param value - The new value.
    //    */
    //   setItem(key: string, value: string | null): void {
    //     if (value) {
    //       this.data.set(key, value);
    //     } else {
    //       this.data.delete(key);
    //     }
    //   }

    //   /**
    //    * Removes the key/value pair with the given key, if a key/value pair with the given key exists.
    //    * @param key - The storage key.
    //    */
    //   removeItem(key: string): void {
    //     this.data.delete(key);
    //   }

    //   /**
    //    * Returns the name of the nth key, or null if n is greater than or equal to the number of key/value pairs.
    //    * @param index - The numeric index.
    //    * @returns The nth key.
    //    */
    //   key(index: number): string | null {
    //     return Array.from(this.data.keys())[index];
    //   }
    // }

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
