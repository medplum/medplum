import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { URL as NodeURL, URLSearchParams as NodeURLSearchParams } from 'node:url';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { polyfillMedplumWebAPIs } from '.';

jest.mock(
  'expo-crypto',
  () =>
    ({
      digest: async function (algorithm: CryptoDigestAlgorithm, data: BufferSource): Promise<ArrayBuffer> {
        const dataStr = new TextDecoder().decode(data);
        if ((algorithm as string) === 'SHA-256' && dataStr === 'Medplum_is_cool') {
          return Promise.resolve(
            new Uint8Array([
              0x97, 0xe9, 0xb0, 0xd6, 0x96, 0xa6, 0xcd, 0x12, 0xd2, 0xf5, 0x61, 0x56, 0x07, 0x16, 0x8b, 0x49, 0xe6,
              0x07, 0xb1, 0xbe, 0x52, 0x73, 0xe7, 0x87, 0x2e, 0x2c, 0x7e, 0x02, 0x3d, 0x99, 0x95, 0xc9,
            ])
          );
        }
        throw new Error('Invalid input!');
      },
    }) satisfies { digest: typeof digest }
);

jest.mock('expo-standard-web-crypto', () => ({}));
jest.mock('react-native-url-polyfill', () => ({
  setupURLPolyfill: () => {
    // @ts-expect-error Just for testing
    window.URL = NodeURL;
    // @ts-expect-error Just for testing
    window.URLSearchParams = NodeURLSearchParams;
  },
}));

describe('polyfillMedplumWebAPIs', () => {
  beforeAll(() => {
    polyfillMedplumWebAPIs();
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

    test('Should be able to hash a message', async () => {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode('Medplum_is_cool'));
      expect(digest).toEqual(
        new Uint8Array([
          0x97, 0xe9, 0xb0, 0xd6, 0x96, 0xa6, 0xcd, 0x12, 0xd2, 0xf5, 0x61, 0x56, 0x07, 0x16, 0x8b, 0x49, 0xe6, 0x07,
          0xb1, 0xbe, 0x52, 0x73, 0xe7, 0x87, 0x2e, 0x2c, 0x7e, 0x02, 0x3d, 0x99, 0x95, 0xc9,
        ])
      );
    });
  });

  describe('Location', () => {
    test('Should be `http://localhost`', () => {
      expect(window.location).toBeDefined();
      expect(window.location.toString()).toEqual('http://localhost/');
    });

    test('Should have a callable .assign() function', () => {
      expect(window.location.assign).toBeDefined();
      expect(window.location.assign).toBeInstanceOf(Function);
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
