import { MemoryStorage } from '@medplum/core';
import { subtle, webcrypto } from 'node:crypto';
import { Platform } from 'react-native';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { cleanupMedplumWebAPIs, polyfillMedplumWebAPIs } from '.';

if (Platform.OS === 'web') {
  // Polyfill the globals that should be there on web but are missing from jsdom for some reason
  // See: https://caniuse.com/?search=localstorage
  // See: https://caniuse.com/?search=textencoder%2Ctextdecoder
  // See: https://caniuse.com/?search=crypto
  // See: https://caniuse.com/?search=subtlecrypto
  globalThis.localStorage = new MemoryStorage();
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
  // @ts-expect-error Crypto expected to be defined, but is not in Node/jsdom env
  window.crypto = webcrypto;
  // @ts-expect-error SubtleCrypto expected to be defined, but is not in Node/jsdom env
  window.crypto.subtle = subtle;
}

describe('polyfillMedplumWebAPIs', () => {
  const originalWindow = globalThis.window;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { ...originalWindow },
    });
    polyfillMedplumWebAPIs();
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
    });
    cleanupMedplumWebAPIs();
  });

  describe('Encoding', () => {
    describe('TextEncoder', () => {
      test('Should have a global `window.TextEncoder` and `window.TextDecoder`', () => {
        expect(window.TextEncoder).toBeDefined();
        expect(window.TextDecoder).toBeDefined();
        expect(() => new window.TextEncoder()).not.toThrow();
        expect(() => new window.TextDecoder()).not.toThrow();
      });

      test('Should be able to encode a string with the `TextEncoder`', () => {
        const encoder = new window.TextEncoder();
        const encoded = encoder.encode('Hello, World!');
        expect(encoded).toEqual(new Uint8Array([72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33]));
      });

      test('Should be able to decode a string with the `TextDecoder`', () => {
        const decoder = new window.TextDecoder();
        const decoded = decoder.decode(new Uint8Array([72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33]));
        expect(decoded).toEqual('Hello, World!');
      });
    });

    describe('btoa & atob', () => {
      test('Should have globals `btoa` and `atob`', () => {
        expect(window.btoa).toBeDefined();
        expect(window.atob).toBeDefined();
      });

      test('btoa', () => {
        expect(btoa('Medplum_is_cool')).toEqual('TWVkcGx1bV9pc19jb29s');
      });

      test('atob', () => {
        expect(atob('TWVkcGx1bV9pc19jb29s')).toEqual('Medplum_is_cool');
      });
    });
  });

  describe('Crypto', () => {
    test('Should have `window.crypto` object and expected crypto functions', () => {
      expect(window.crypto).toBeDefined();
      expect(window.crypto.subtle).toBeDefined();
      expect(window.crypto.subtle.digest).toBeDefined();
    });
  });

  describe('Location', () => {
    test('Should be `http://localhost`', () => {
      expect(window.location).toBeDefined();
      expect(window.location.toString()).toEqual('http://localhost/');
    });

    test('Should have a callable .assign() function', () => {
      expect(window.location.assign).toBeDefined();
      expect(window.location.assign.call).toBeDefined();
      expect(() => window.location.assign('http://localhost:80')).not.toThrow();
    });
  });

  describe('window.sessionStorage', () => {
    afterAll(() => {
      window.sessionStorage.clear();
    });

    test('Should be defined', () => {
      expect(window.sessionStorage).toBeDefined();
    });

    test('Should be able to be set and read from', () => {
      expect(() => window.sessionStorage.setItem('med', 'plum')).not.toThrow();
      expect(window.sessionStorage.getItem('med')).toBe('plum');
    });
  });
});
