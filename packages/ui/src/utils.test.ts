import { initGoogleAuth } from './utils';

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
});
