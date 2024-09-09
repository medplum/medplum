import { Platform } from 'react-native';
import { cleanupMedplumWebAPIs, polyfillMedplumWebAPIs } from '.';

describe('Medplum polyfills', () => {
  const originalWindow = window;

  beforeEach(() => {
    cleanupMedplumWebAPIs();
    Object.defineProperty(globalThis, 'window', {
      value: { ...originalWindow },
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
    });
  });

  if (Platform.OS !== 'web') {
    describe('polyfillMedplumWebAPIs()', () => {
      test('Not disabling location polyfill overrides existing location polyfill', () => {
        const originalLocation = window.location;
        // @ts-expect-error TS expects location to always be defined
        window.location = undefined;
        polyfillMedplumWebAPIs({ location: true });
        expect(window.location).not.toEqual(undefined);
        window.location = originalLocation;
      });

      test('Disable location polyfill', () => {
        const originalLocation = window.location;
        // @ts-expect-error TS expects location to always be defined
        window.location = undefined;
        polyfillMedplumWebAPIs({ location: false });
        expect(window.location).toEqual(undefined);
        window.location = originalLocation;
      });

      test('Polyfilling multiple times should not break', () => {
        expect(() => polyfillMedplumWebAPIs()).not.toThrow();
        expect(() => polyfillMedplumWebAPIs()).not.toThrow();
        // There was specifically trouble with this object when calling polyfill multiple times before
        expect(window.crypto.subtle).toBeDefined();
      });

      test('Event should be constructable after polyfills', () => {
        // @ts-expect-error Testing polyfill
        globalThis.Event = undefined;
        expect(() => new Event('foo')).toThrow();
        polyfillMedplumWebAPIs();

        const event1 = new Event('foo');
        expect(event1).toBeInstanceOf(Event);
        expect(event1.type).toEqual('foo');

        const event2 = new Event('foo', { bubbles: true, cancelable: true, composed: true });
        expect(event2).toBeInstanceOf(Event);
        expect(event2.type).toEqual('foo');
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
