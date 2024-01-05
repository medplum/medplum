import { MemoryStorage } from '@medplum/core';
import { subtle, webcrypto } from 'node:crypto';
import { Platform } from 'react-native';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { ExpoClientStorage, cleanupMedplumWebAPIs, polyfillMedplumWebAPIs } from '.';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    },
    getItemAsync: async (key: string): Promise<string | null> => {
      return Promise.resolve(store.get(key) ?? null);
    },
    deleteItemAsync: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
});

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
  beforeAll(() => {
    polyfillMedplumWebAPIs();
  });

  afterAll(() => {
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

    // TODO: Add a test for `digest`
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

  describe('ExpoClientStorage', () => {
    let clientStorage: ExpoClientStorage;

    test('Using storage before initialized should throw', () => {
      clientStorage = new ExpoClientStorage();
      if (Platform.OS !== 'web') {
        expect(() => clientStorage.getObject('test')).toThrow();
      }
    });

    test('Waiting for initialized', async () => {
      await clientStorage.getInitPromise();
      expect(() => clientStorage.getObject('test')).not.toThrow();
    });

    test('Setting an string', async () => {
      clientStorage.setString('bestEhr', 'medplum');
      expect(clientStorage.length).toBeDefined();
      expect(clientStorage.length).toBe(1);
    });

    test('Getting a string', () => {
      expect(clientStorage.getString('bestEhr')).toEqual('medplum');
    });

    test('Setting an object', async () => {
      clientStorage.setObject('bestEhr', { med: 'plum' });
      expect(clientStorage.length).toBeDefined();
      expect(clientStorage.length).toBe(1);
    });

    test('Getting an object', () => {
      expect(clientStorage.getObject('bestEhr')).toEqual({ med: 'plum' });
    });

    test('Making a new storage should fetch existing keys', async () => {
      const newStorage = new ExpoClientStorage();
      await newStorage.getInitPromise();
      // Assert size
      expect(newStorage.length).toEqual(1);
    });

    test('Clearing storage should empty it', () => {
      clientStorage.clear();
      expect(clientStorage.length).toEqual(0);
    });

    test('After clearing, new storages should not get previous keys', async () => {
      const newStorage = new ExpoClientStorage();
      await newStorage.getInitPromise();
      // Assert size is 0
      expect(newStorage.length).toEqual(0);
    });
  });
});
