---
sidebar_position: 11
tags: [auth]
---

import ExampleCode from '!!raw-loader!@site/../examples/src/auth/pre-authorized-code.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Pre-Authorized Code

Medplum supports the OAuth 2.0 pre-authorized code grant type, `urn:ietf:params:oauth:grant-type:pre-authorized_code`, as defined by [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html). This flow is useful for magic links and other issuer-initiated flows where user authentication and consent have already happened before the client asks Medplum for tokens.

## Overview

This flow has two steps:

1. A trusted backend creates a one-time pre-authorized code by calling `/auth/preauthorize`.
1. The receiving application redeems that code at `/oauth2/token` to obtain Medplum tokens.

Unlike the authorization code flow, this flow does not redirect the user through the authorization endpoint.

## Prerequisites

To use this flow:

- Create a [`ClientApplication`](https://app.medplum.com/ClientApplication) with [Project Admin](/docs/access/admin#project-admin) privileges.
- Authenticate your backend as that `ClientApplication`, typically with the [Client Credentials Flow](/docs/auth/client-credentials).
- Include the `X-Medplum-On-Behalf-Of` header when creating the pre-authorized code. This identifies the Medplum user who will receive the resulting token. See [On-Behalf-Of](/docs/auth/on-behalf-of) for details.

:::caution[One-time codes]

Pre-authorized codes are single-use and expire automatically. By default, Medplum issues codes that expire after 1 hour. The maximum allowed lifetime is 24 hours.

:::

## Create a pre-authorized code

Send an authenticated `POST` request to `/auth/preauthorize`.

Request headers:

- `Authorization`: Your `ClientApplication` access token or basic auth credentials
- `X-Medplum-On-Behalf-Of`: The target `ProjectMembership`, `Practitioner`, `Patient`, or other supported profile reference
- `Content-Type: application/json`

Request body:

- `clientId`: Required. The target [`ClientApplication`](https://app.medplum.com/ClientApplication) ID.
- `scope`: Optional. Defaults to `openid`.
- `nonce`: Optional. If omitted, Medplum generates a random nonce.
- `expiresIn`: Optional expiration time in seconds. Must be between `1` and `86400`.

Example:

<Tabs groupId="language">
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="createPreAuthorizedCode">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="createPreAuthorizedCodeCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

On success, Medplum returns a response like:

```json
{
  "preAuthorizedCode": "<ONE_TIME_CODE>",
  "expiresAt": "2026-05-16T20:15:00.000Z"
}
```

You can package this code into a magic link, QR code, or handoff to a wallet or application that will redeem it.

## Redeem the pre-authorized code

To redeem the code, send a form-encoded `POST` request to `/oauth2/token` with:

- `grant_type`: `urn:ietf:params:oauth:grant-type:pre-authorized_code`
- `client_id`: The [`ClientApplication`](https://app.medplum.com/ClientApplication) ID
- `pre-authorized_code`: The one-time code returned by `/auth/preauthorize`

Example:

<Tabs groupId="language">
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="redeemPreAuthorizedCode">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="redeemPreAuthorizedCodeCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

On success, the response includes a Medplum access token and ID token:

```json
{
  "token_type": "Bearer",
  "access_token": "<ACCESS_TOKEN>",
  "id_token": "<ID_TOKEN>",
  "scope": "openid",
  "expires_in": 3600
}
```

## Notes

- Pre-authorized codes can only be redeemed once.
- If a code is expired, already used, revoked, or presented for the wrong client, Medplum returns an OAuth error response from `/oauth2/token`.
- Medplum currently supports the pre-authorized code flow without an additional transaction code (`tx_code`).

For more details, see the [OpenID for Verifiable Credential Issuance 1.0 specification](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html), especially the sections on [Pre-Authorized Code Flow](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#section-3.5) and [Token Request](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#section-6.1).
