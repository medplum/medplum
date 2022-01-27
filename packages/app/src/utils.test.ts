import { initGoogleAuth, initRecaptcha } from './utils';

describe('Utils', () => {
  beforeEach(() => {
    // Reset the DOM
    document.getElementsByTagName('html')[0].innerHTML = '';
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

  test('initRecaptcha', () => {
    expect(document.getElementsByTagName('script').length).toBe(0);

    // Init Recaptcha
    // Should create a <script> tag for the Recaptcha script.
    initRecaptcha();
    expect(document.getElementsByTagName('script').length).toBe(1);

    // Simulate loading the script
    Object.defineProperty(global, 'grecaptcha', { value: {} });

    // Initializing again should not create more <script> tags
    initRecaptcha();
    expect(document.getElementsByTagName('script').length).toBe(1);
  });
});
