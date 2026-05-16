// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';

/*
// start-block createPreAuthorizedCodeCurl
curl -X POST 'https://api.medplum.com/auth/preauthorize' \
  --user "$MY_CLIENT_ID:$MY_CLIENT_SECRET" \
  -H 'Content-Type: application/json' \
  -H 'X-Medplum-On-Behalf-Of: Practitioner/00000000-0000-0000-0000-000000000000' \
  --data-raw '{
    "clientId": "00000000-0000-0000-0000-000000000000",
    "scope": "openid",
    "expiresIn": 3600
  }'
// end-block createPreAuthorizedCodeCurl
*/

/*
// start-block redeemPreAuthorizedCodeCurl
curl -X POST 'https://api.medplum.com/oauth2/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code' \
  --data-urlencode 'client_id=00000000-0000-0000-0000-000000000000' \
  --data-urlencode 'pre-authorized_code=<PRE_AUTHORIZED_CODE>'
// end-block redeemPreAuthorizedCodeCurl
*/

const MEDPLUM_BASE_URL = 'https://api.medplum.com/';
const MY_CLIENT_ID = 'my-client-id';
const MY_CLIENT_SECRET = 'my-client-secret';
const ON_BEHALF_OF = 'Practitioner/00000000-0000-0000-0000-000000000000';

// start-block createPreAuthorizedCode
const medplum = new MedplumClient({
  baseUrl: MEDPLUM_BASE_URL,
  clientId: MY_CLIENT_ID,
  clientSecret: MY_CLIENT_SECRET,
});

const preAuthResult = await medplum.post(
  'auth/preauthorize',
  {
    clientId: MY_CLIENT_ID,
    scope: 'openid',
    expiresIn: 3600,
    nonce: 'optional-nonce-value',
  },
  undefined,
  {
    headers: {
      'X-Medplum-On-Behalf-Of': ON_BEHALF_OF,
    },
  }
);
// end-block createPreAuthorizedCode

// start-block redeemPreAuthorizedCode
const tokenResponse = await fetch(`${MEDPLUM_BASE_URL}oauth2/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
    client_id: MY_CLIENT_ID,
    'pre-authorized_code': preAuthResult.preAuthorizedCode,
  }),
});

const tokens = await tokenResponse.json();
console.log(tokens.access_token);
// end-block redeemPreAuthorizedCode
