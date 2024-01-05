import { Platform } from 'react-native';
import { cleanupMedplumWebAPIs, polyfillMedplumWebAPIs } from '.';

describe('Medplum polyfills', () => {
  afterEach(() => {
    cleanupMedplumWebAPIs();
  });

  if (Platform.OS !== 'web') {
    describe('polyfillMedplumWebAPIs() - w/ Config', () => {
      test('Not disabling location polyfill overrides existing location polyfill', () => {
        // @ts-expect-error window.location should not be undefined normally
        window.location = undefined;
        polyfillMedplumWebAPIs({ location: true });
        expect(window.location).not.toEqual(undefined);
      });

      test('Disable location polyfill', () => {
        // @ts-expect-error window.location should not be undefined normally
        window.location = undefined;
        polyfillMedplumWebAPIs({ location: false });
        expect(window.location).toEqual(undefined);
      });
    });

    describe('cleanupMedplumWebAPIs()', () => {
      test('Cleans up after polyfillMedplumWebAPIs()', () => {
        const originalCrypto = window.crypto;
        // Check that before polyfilling that these
        expect(window.location).toEqual(undefined);

        // After polyfilling, make sure it works
        polyfillMedplumWebAPIs();
        expect(window.location).not.toEqual(undefined);
        expect(window.crypto).not.toEqual(originalCrypto);

        cleanupMedplumWebAPIs();
        // Should be undefined again
        expect(window.location).toEqual(undefined);
        expect(window.crypto).toEqual(originalCrypto);
      });

      test('No-ops if nothing to clean up', () => {
        const originalCrypto = window.crypto;
        expect(() => cleanupMedplumWebAPIs()).not.toThrow();
        expect(window.crypto).toEqual(originalCrypto);
      });
    });
  } else {
    // Web only
    // TODO: Eventually set up separate test "includes" for each environment

    let original: Location;

    beforeAll(() => {
      original = window.location;
    });

    test('polyfillMedplumWebAPIs() - noop', () => {
      polyfillMedplumWebAPIs();
      expect(original).toEqual(window.location);
    });

    test('cleanupMedplumWebAPIs() - noop', () => {
      cleanupMedplumWebAPIs();
      expect(original).toEqual(window.location);
    });
  }
});
