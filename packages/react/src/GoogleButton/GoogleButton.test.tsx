import { getGoogleClientId } from './GoogleButton.utils';

describe('GoogleButton', () => {
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
});
