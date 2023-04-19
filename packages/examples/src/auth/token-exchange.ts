import { MedplumClient } from '@medplum/core';

/*
// start-block tokenExchangeCurl
curl -X POST 'https://api.medplum.com/oauth2/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
--data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
--data-urlencode "client_id=<Your ClientApplication ID>" \
--data-urlencode "subject_token=<External Access Token>"
// end-block tokenExchangeCurl
*/

/**
 * The Medplum API server URL.
 * The default value for Medplum's hosted API server is "https://api.medplum.com/".
 * If you are using your own Medplum server, then you can set this value to your server URL.
 */
const MEDPLUM_BASE_URL = 'https://api.medplum.com/';

/**
 * Your Medplum client ID.
 * You can find this value on the "Project Admin" page in the Medplum web app.
 * Note that the client must have the correct external auth provider configured.
 */
const MEDPLUM_CLIENT_ID = 'MY_CLIENT_ID';

/**
 * External access tokem.
 * This value is specific to your external auth provider.
 */
const EXTERNAL_ACCESS_TOKEN = 'MY_EXTERNAL_ACCESS_TOKEN';

// start-block tokenExchange
// Create MedplumClient
const medplum = new MedplumClient({
  baseUrl: MEDPLUM_BASE_URL,
  clientId: MEDPLUM_CLIENT_ID,
});

// Exchange external token
await medplum.exchangeExternalAccessToken(EXTERNAL_ACCESS_TOKEN);
// end-block tokenExchange
