declare const google: unknown;

export function getGoogleClientId(clientId: string | undefined): string | undefined {
  if (clientId) {
    return clientId;
  }

  const origin = window.location.protocol + '//' + window.location.host;
  const authorizedOrigins = process.env.GOOGLE_AUTH_ORIGINS?.split(',') ?? [];
  if (authorizedOrigins.includes(origin)) {
    return process.env.GOOGLE_CLIENT_ID;
  }

  return undefined;
}

/**
 * Dynamically loads the Google Auth script.
 * We do not want to load the script on page load unless the user needs it.
 */
export function initGoogleAuth(): void {
  if (typeof google === 'undefined') {
    createScriptTag('https://accounts.google.com/gsi/client');
  }
}

/**
 * Dynamically creates a script tag for the specified JavaScript file.
 * @param src The JavaScript file URL.
 */
export function createScriptTag(src: string): void {
  const head = document.getElementsByTagName('head')[0];
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  head.appendChild(script);
}
