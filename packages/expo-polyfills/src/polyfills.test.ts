import { Platform } from 'react-native';
import { cleanupMedplumWebAPIs, polyfillMedplumWebAPIs } from '.';

describe('Medplum polyfills', () => {
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
