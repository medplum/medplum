import { getGoogleClientId, initGoogleAuth } from './utils';

describe('Utils', () => {
  beforeEach(() => {
    // Reset the DOM
    document.getElementsByTagName('html')[0].innerHTML = '';
  });

  test('googleClientId', () => {
    expect(getGoogleClientId('foo')).toBeDefined();

    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'https:',
        host: 'app.medplum.com',
      },
    });
    process.env.GOOGLE_AUTH_ORIGINS = 'https://app.medplum.com';
    process.env.GOOGLE_CLIENT_ID = 'foo';
    expect(getGoogleClientId(undefined)).toBeDefined();

    window.location.host = 'evil.com';
    expect(getGoogleClientId(undefined)).toBeUndefined();
  });

  test('initGoogleAuth', () => {
    expect(document.getElementsByTagName('script').length).toBe(0);

    // Init Google Auth
    // Should create a <script> tag for the Google Auth script.
    initGoogleAuth();
    expect(document.getElementsByTagName('script').length).toBe(1);

    // Simulate loading the script
    Object.defineProperty(global, 'google', { value: {} });

    // Initializing again should not create more <script> tags
    initGoogleAuth();
    expect(document.getElementsByTagName('script').length).toBe(1);
  });
});
