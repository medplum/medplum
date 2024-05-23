import { MemoryStorage } from '@medplum/core';
import { decode, encode } from 'base-64';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import expoWebCrypto from 'expo-standard-web-crypto';
import { Platform } from 'react-native';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { polyfillEvent } from './polyfills/event';

export { ExpoClientStorage, type IExpoClientStorage } from './storage';

let polyfilled = false;
let originalCryptoIsSet = false;
let originalCrypto: Crypto | undefined;

export type ExtendedExpoCrypto = typeof expoWebCrypto & {
  subtle: {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
  };
};

export type PolyfillEnabledConfig = {
  crypto?: boolean;
  location?: boolean;
  sessionStorage?: boolean;
  textEncoder?: boolean;
  btoa?: boolean;
  event?: boolean;
};

export function cleanupMedplumWebAPIs(): void {
  if (Platform.OS === 'web' || !polyfilled) {
    return;
  }
  if (window.crypto) {
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      enumerable: true,
      value: originalCrypto,
    });
    Object.defineProperty(expoWebCrypto, 'subtle', {
      configurable: true,
      enumerable: false,
      value: undefined,
    });
    originalCrypto = undefined;
    originalCryptoIsSet = false;
  }
  if (window.location) {
    Object.defineProperty(window, 'location', { configurable: true, enumerable: true, value: undefined });
  }
  if (window.sessionStorage) {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      enumerable: true,
      value: undefined,
    });
  }
  if (window.TextEncoder) {
    Object.defineProperty(window, 'TextEncoder', {
      configurable: true,
      enumerable: true,
      value: undefined,
    });
  }
  if (window.TextDecoder) {
    Object.defineProperty(window, 'TextDecoder', {
      configurable: true,
      enumerable: true,
      value: undefined,
    });
  }
  // @ts-expect-error Typescript thinks `btoa` is always defined
  if (window.btoa) {
    Object.defineProperty(window, 'btoa', { configurable: true, enumerable: true, value: undefined });
  }
  // @ts-expect-error Typescript thinks `atob` is always defined
  if (window.atob) {
    Object.defineProperty(window, 'atob', { configurable: true, enumerable: true, value: undefined });
  }

  if (window.Event) {
    Object.defineProperty(window, 'Event', { configurable: true, enumerable: true, value: undefined });
  }

  polyfilled = false;
}

export function polyfillMedplumWebAPIs(config?: PolyfillEnabledConfig): void {
  if (Platform.OS === 'web' || polyfilled) {
    return;
  }
  if (
    config?.crypto !== false &&
    (typeof window.crypto?.subtle?.digest === 'undefined' || typeof window.crypto.getRandomValues === 'undefined')
  ) {
    // eslint-disable-next-line no-inner-declarations
    async function polyfilledDigest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
      return digest(algorithm as CryptoDigestAlgorithm, data);
    }

    // We can't do a check for `originalCrypto === undefined` because the original value for `window.crypto` could be undefined itself
    // Resulting in an ambiguity and setting `originalCrypto = window.crypto` potentially after `window.crypto` has already been polyfilled
    if (!originalCryptoIsSet) {
      originalCrypto = window.crypto;
      originalCryptoIsSet = true;
    }

    // @ts-expect-error Subtle not polyfilled by default with ExpoWebCrypto
    if (expoWebCrypto.subtle === undefined) {
      const subtlePolyfill = { digest: polyfilledDigest };
      Object.defineProperty(expoWebCrypto, 'subtle', {
        configurable: true,
        get: () => subtlePolyfill,
      });
    }

    Object.defineProperty(window, 'crypto', {
      configurable: true,
      enumerable: true,
      get: () => expoWebCrypto,
    });
  }

  if (config?.location !== false && typeof window.location === 'undefined') {
    setupURLPolyfill();
    const locationUrl = new URL('/', 'http://localhost') as URL & { assign: () => void };
    locationUrl.assign = () => {};
    Object.defineProperty(window, 'location', {
      value: locationUrl,
      configurable: true,
    });
  }

  let _sessionStorage: Storage;
  if (config?.sessionStorage !== false && typeof window.sessionStorage === 'undefined') {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      enumerable: true,
      get: () => (_sessionStorage ??= new MemoryStorage()),
    });
  }

  if (config?.textEncoder !== false && typeof window.TextEncoder === 'undefined') {
    Object.defineProperty(window, 'TextEncoder', {
      configurable: true,
      enumerable: true,
      get: () => TextEncoder,
    });
  }

  if (config?.textEncoder !== false && typeof window.TextDecoder === 'undefined') {
    Object.defineProperty(window, 'TextDecoder', {
      configurable: true,
      enumerable: true,
      get: () => TextDecoder,
    });
  }

  if (config?.btoa !== false) {
    Object.defineProperty(window, 'btoa', {
      configurable: true,
      enumerable: true,
      get: () => encode,
    });
  }

  if (config?.btoa !== false) {
    Object.defineProperty(window, 'atob', {
      configurable: true,
      enumerable: true,
      get: () => decode,
    });
  }

  if (config?.event !== false && typeof window.Event === 'undefined') {
    polyfillEvent();
  }

  polyfilled = true;
}
