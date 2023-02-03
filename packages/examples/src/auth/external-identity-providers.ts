import { MedplumClient } from '@medplum/core';

/**
 * The Medplum API server URL.
 * The default value for Medplum's hosted API server is "https://api.medplum.com/".
 * If you are using your own Medplum server, then you can set this value to your server URL.
 */
const MEDPLUM_BASE_URL = 'https://api.medplum.com/';

/**
 * Your Medplum project ID.
 * You can find this value on the "Project Admin" page in the Medplum web app.
 */
const MEDPLUM_PROJECT_ID = 'MY_PROJECT_ID';

/**
 * Your Medplum client ID.
 * You can find this value on the "Project Admin" page in the Medplum web app.
 * Note that the client must have the correct external auth provider configured.
 */
const MEDPLUM_CLIENT_ID = 'MY_CLIENT_ID';

/**
 * Your web application redirect URL.
 * This value must match the redirect URI in your Medplum client application.
 */
const WEB_APP_REDIRECT_URI = 'http://localhost:8000';

/**
 * External OAuth2 "authorize" endpoint URL.
 * For example, this would be an Auth0, AWS Cognito, or Okta URL.
 * This value is specific to your external auth provider.
 */
const EXTERNAL_AUTHORIZE_URL = 'https://my-tenant.us.auth0.com/authorize';

/**
 * External OAuth2 client ID.
 * This value is specific to your external auth provider.
 */
const EXTERNAL_CLIENT_ID = 'MY_EXTERNAL_CLIENT_ID';

/**
 * External OAuth2 redirect URI.
 * This must match the redirect URI configured in your external auth provider.
 * If using Medplum's hosted API server, the redirect URI must be "https://api.medplum.com/auth/external".
 * If using your own Medplum server, the redirect URI must be "https://<your server>/auth/external".
 */
const EXTERNAL_REDIRECT_URI = MEDPLUM_BASE_URL + 'auth/external';

const medplum = new MedplumClient({
  baseUrl: MEDPLUM_BASE_URL,
  clientId: MEDPLUM_CLIENT_ID,
});

// start-block processCode
// The code check
// If the current URL includes a "code" query string param, then we can exchange it for a token
const code = new URLSearchParams(window.location.search).get('code');
if (code) {
  // Process the code
  // On success, remove the query string parameters
  medplum
    .processCode(code)
    .then(() => (window.location.href = window.location.href.split('?')[0]))
    .catch(console.error);
}
// end-block processCode

// start-block signInWithExternalAuth
// The login button handler
// The user can click this button to initiate the OAuth flow
$('login').addEventListener('click', () =>
  medplum.signInWithExternalAuth(EXTERNAL_AUTHORIZE_URL, EXTERNAL_CLIENT_ID, EXTERNAL_REDIRECT_URI, {
    projectId: MEDPLUM_PROJECT_ID,
    clientId: MEDPLUM_CLIENT_ID,
    redirectUri: WEB_APP_REDIRECT_URI,
  })
);
// end-block signInWithExternalAuth

// The userinfo button handler
// Use the access token to call the "/userinfo" to get current user details
// Display the output in the window
$('userinfo').addEventListener('click', () => {
  medplum.get('oauth2/userinfo').then(showOutput).catch(alert);
});

// The practitioners button handler
// Use the access token to call the "/userinfo" to get current user details
// Display the output in the window
$('practitioners').addEventListener('click', () => {
  medplum.search('Practitioner').then(showOutput).catch(alert);
});

function showOutput(obj: any): void {
  $('output').innerHTML = JSON.stringify(obj, null, 2);
}

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}
