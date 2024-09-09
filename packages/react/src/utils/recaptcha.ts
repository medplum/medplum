import { createScriptTag } from './script';

// reCAPTCHA type definitions do not work with Vite project aliasing.
// Project aliasing is more valuable than type definitions,
// so cheating and using `any` here.
declare let grecaptcha: any;

/**
 * Dynamically loads the recaptcha script.
 * We do not want to load the script on page load unless the user needs it.
 * @param siteKey - The reCAPTCHA site key, available from the reCAPTCHA admin page.
 */
export function initRecaptcha(siteKey: string): void {
  if (typeof grecaptcha === 'undefined') {
    createScriptTag('https://www.google.com/recaptcha/api.js?render=' + siteKey);
  }
}

/**
 * Starts a request to generate a recapcha token.
 * @param siteKey - The reCAPTCHA site key, available from the reCAPTCHA admin page.
 * @returns Promise to a recaptcha token for the current user.
 */
export function getRecaptcha(siteKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    grecaptcha.ready(async () => {
      try {
        resolve(await grecaptcha.execute(siteKey, { action: 'submit' }));
      } catch (err) {
        reject(err);
      }
    });
  });
}
