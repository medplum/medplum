import type { MedplumClient } from '@medplum/core';
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

export function polyfillMedplumWebAPIs(medplum: MedplumClient): void {
  if (typeof window.crypto === 'undefined') {
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
    const locationUrl = new URL('/', medplum.getBaseUrl()) as URL & { assign: () => void };
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
      get: () => (_sessionStorage ??= new Storage()),
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

async function polyfilledDigest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
  return digest(algorithm as CryptoDigestAlgorithm, data);
}

class Storage {
  private data: Map<string, string>;

  constructor() {
    this.data = new Map<string, string>();
  }

  public key(n: number): string {
    return Array.from(this.data.keys())[n];
  }

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public get length(): number {
    return this.data.size;
  }

  public setItem(key: string, value: any): void {
    this.data.set(key, value.toString());
  }

  public removeItem(key: string): void {
    this.data.delete(key);
  }

  public clear(): void {
    this.data = new Map<string, string>();
  }
}
