import { MemoryStorage } from '@medplum/core';
import { decode, encode } from 'base-64';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import expoWebCrypto from 'expo-standard-web-crypto';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import { TextDecoder, TextEncoder } from 'text-encoding';

export type ExtendedExpoCrypto = typeof expoWebCrypto & {
  subtle: {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
  };
};

export function polyfillMedplumWebAPIs(): void {
  if (typeof window.crypto === 'undefined') {
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
