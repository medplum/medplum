import { Button, Stack, Title } from '@mantine/core';
import { useMedplum, Document, useMedplumNavigate } from '@medplum/react';
import { useCallback, useEffect } from 'react';

/**
 * The Medplum API server URL.
 * The default value for Medplum's hosted API server is "https://api.medplum.com/".
 * If you are using your own Medplum server, then you can set this value to your server URL.
 */
const MEDPLUM_BASE_URL = 'https://api.medplum.com/';
// const MEDPLUM_BASE_URL = 'http://localhost:8103/';

/**
 * Your Medplum project ID.
 * You can find this value on the "Project Admin" page in the Medplum web app.
 */
const MEDPLUM_PROJECT_ID = '';

/**
 * Your Medplum client ID.
 * You can find this value on the "Project Admin" page in the Medplum web app.
 * Note that the client must have the correct external auth provider configured.
 */
const MEDPLUM_CLIENT_ID = '=';

/**
 * Your web application redirect URL.
 * This value must match the redirect URI in your Medplum client application.
 */
const WEB_APP_REDIRECT_URI = 'http://localhost:8000/signin';

/**
 * External OAuth2 "authorize" endpoint URL.
 * For example, this would be an Auth0, AWS Cognito, or Okta URL.
 * This value is specific to your external auth provider.
 */
const EXTERNAL_AUTHORIZE_URL = '';

/**
 * External OAuth2 client ID.
 * This value is specific to your external auth provider.
 */
const EXTERNAL_CLIENT_ID = '';

/**
 * External OAuth2 redirect URI.
 * This must match the redirect URI configured in your external auth provider.
 * If using Medplum's hosted API server, the redirect URI must be "https://api.medplum.com/auth/external".
 * If using your own Medplum server, the redirect URI must be "https://<your server>/auth/external".
 */
const EXTERNAL_REDIRECT_URI = MEDPLUM_BASE_URL + 'auth/external';

export function SignInPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();

  // The code check
  // If the current URL includes a "code" query string param, then we can exchange it for a token
  const code = new URLSearchParams(window.location.search).get('code');

  useEffect(() => {
    console.log('Got code', code);
    if (code) {
      // Process the code
      // On success, remove the query string parameters
      medplum
        .processCode(code)
        .then(() => navigate('/'))
        .catch(console.error);
    }
  }, [medplum, navigate, code]);

  const handleClick = useCallback(() => {
    medplum
      .signInWithExternalAuth(
        EXTERNAL_AUTHORIZE_URL,
        EXTERNAL_CLIENT_ID,
        EXTERNAL_REDIRECT_URI,
        {
          projectId: MEDPLUM_PROJECT_ID,
          clientId: MEDPLUM_CLIENT_ID,
          redirectUri: WEB_APP_REDIRECT_URI,
        },
        false,
      )
      .catch(console.error);
  }, [medplum]);

  return (
    <Document width={500}>
      <Stack align="center">
        <Title order={2}>Welcome!</Title>
        <Button onClick={handleClick}>Sign In</Button>
      </Stack>
    </Document>
  );
}
