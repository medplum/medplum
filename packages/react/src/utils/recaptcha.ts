import { createScriptTag } from './script';

declare let grecaptcha: undefined | ReCaptchaV2.ReCaptcha;

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
    if (typeof grecaptcha === 'undefined') {
      reject(new Error('grecaptcha not found'));
      return;
    }

    // a strongly typed reference to appease typescript within the ready callback
    const grecaptchaClient: ReCaptchaV2.ReCaptcha = grecaptcha;

    grecaptchaClient.ready(async () => {
      try {
        resolve(await grecaptchaClient.execute(siteKey, { action: 'submit' }));
      } catch (err) {
        reject(err);
      }
    });
  });
}
