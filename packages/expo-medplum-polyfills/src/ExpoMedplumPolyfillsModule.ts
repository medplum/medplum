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

async function polyfilledDigest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
  return digest(algorithm as CryptoDigestAlgorithm, data);
}
