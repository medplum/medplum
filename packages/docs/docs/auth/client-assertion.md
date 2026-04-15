---
sidebar_position: 3.5
tags: [auth]
---

import BrowserOnlyTabs from '@site/src/components/BrowserOnlyTabs';
import TabItem from '@theme/TabItem';

# Client Assertion (JWT Bearer)

Client Assertion is an alternative to the [Client Credentials](./client-credentials) flow that authenticates the client using a **signed JWT** instead of a shared client secret. The client signs the JWT with a private key; Medplum verifies it against the public keys published at the client's JWKS URI.

This approach is specified in [RFC 7523 — JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication and Authorization Grants](https://datatracker.ietf.org/doc/html/rfc7523) and is a cornerstone of the [SMART on FHIR Backend Services](https://hl7.org/fhir/smart-app-launch/backend-services.html) specification.

## When to Use Client Assertion

Prefer client assertion over a client secret when:

- A specification **requires** it — SMART Backend Services and some payer integrations mandate JWT-based client authentication.
- You want to **avoid transmitting shared secrets** and instead rely on asymmetric cryptography.
- You need **per-instance key rotation** without updating a central secret.

## Prerequisites

1. A Medplum account. (If not, please [register](https://app.medplum.com/register).)
2. A [ClientApplication](https://app.medplum.com/ClientApplication) — create one on the [Project Admin page](https://app.medplum.com/admin/clients).
3. An asymmetric key pair (RSA or EC). See [Generating a Key Pair](#generating-a-key-pair) below.
4. A publicly accessible JWKS endpoint that hosts your public key.

## Generating a Key Pair

You can generate a key pair with any standard tool. The examples below use `openssl`.

**EC (P-384, recommended):**

```bash
# Generate private key
openssl ecparam -name secp384r1 -genkey -noout -out private.pem

# Derive public key
openssl ec -in private.pem -pubout -out public.pem
```

**RSA (2048-bit minimum):**

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Derive public key
openssl rsa -in private.pem -pubout -out public.pem
```

Keep the **private key** secret. Publish only the **public key** via a JWKS endpoint (see below).

Medplum supports the following signing algorithms: `ES256`, `ES384`, `ES512`, `RS256`, `RS384`, `RS512`.

## Publishing Your Public Key (JWKS)

Medplum fetches your public key at runtime from the URL you configure on the `ClientApplication`. The endpoint must:

- Be publicly accessible over HTTPS.
- Return a JSON object with a `keys` array conforming to [RFC 7517 — JSON Web Key](https://datatracker.ietf.org/doc/html/rfc7517).

**Example JWKS response:**

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-384",
      "use": "sig",
      "kid": "my-key-1",
      "x": "<base64url-encoded x>",
      "y": "<base64url-encoded y>"
    }
  ]
}
```

Many platforms (AWS, GCP, Auth0, etc.) can host a JWKS endpoint for you. If you are self-hosting, you can use `openssl` or a library like [`jose`](https://github.com/panva/jose) to convert your PEM public key to JWK format.

## Configuring the ClientApplication

Set the `jwksUri` field on your `ClientApplication` to the URL of your JWKS endpoint. You can do this in the Medplum App UI or via the FHIR API:

```json
{
  "resourceType": "ClientApplication",
  "name": "My Backend Service",
  "jwksUri": "https://example.com/.well-known/jwks.json"
}
```

## Obtaining a Token

### JWT Claims

The JWT you sign must include the following claims:

| Claim | Required | Value |
|-------|----------|-------|
| `iss` | Yes | Your `ClientApplication` ID (the UUID) |
| `sub` | Yes | Your `ClientApplication` ID (the UUID) |
| `aud` | Yes | The Medplum token endpoint URL (e.g. `https://api.medplum.com/oauth2/token`) |
| `iat` | Yes | Issued-at time (Unix epoch seconds) |
| `exp` | Yes | Expiration time (Unix epoch seconds); keep this short (≤ 5 minutes) |
| `jti` | Recommended | A unique identifier for the JWT to prevent replay attacks |

### Token Request

Once you have a signed JWT, exchange it for an access token with a `client_credentials` grant:

<BrowserOnlyTabs groupId="language">
  <TabItem value="curl" label="cURL">

```bash
JWT="<your-signed-jwt>"

curl -X POST https://api.medplum.com/oauth2/token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" \
    -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
    -d "client_assertion=$JWT"
```

  </TabItem>

  <TabItem value="typescript" label="TypeScript">

```typescript
import { MedplumClient } from '@medplum/core';
import { SignJWT, generateKeyPair, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';

const CLIENT_ID = 'your-client-application-id';
const TOKEN_URL = 'https://api.medplum.com/oauth2/token';

// Load your private key (keep this secret!)
const privateKeyPem = readFileSync('private.pem', 'utf8');
const privateKey = await importPKCS8(privateKeyPem, 'ES384');

// Build and sign the JWT
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES384' })
  .setIssuedAt()
  .setIssuer(CLIENT_ID)
  .setSubject(CLIENT_ID)
  .setAudience(TOKEN_URL)
  .setExpirationTime('5m')
  .sign(privateKey);

// Authenticate with Medplum
const medplum = new MedplumClient();
await medplum.startJwtAssertionLogin(jwt);

// Now make authenticated requests
const patients = await medplum.searchResources('Patient');
```

  </TabItem>

  <TabItem value="python" label="Python">

```python
import time
import uuid
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import jwt  # pip install PyJWT cryptography

CLIENT_ID = 'your-client-application-id'
TOKEN_URL = 'https://api.medplum.com/oauth2/token'

# Load your private key
with open('private.pem', 'rb') as f:
    private_key = serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())

now = int(time.time())
payload = {
    'iss': CLIENT_ID,
    'sub': CLIENT_ID,
    'aud': TOKEN_URL,
    'iat': now,
    'exp': now + 300,  # 5 minutes
    'jti': str(uuid.uuid4()),
}

signed_jwt = jwt.encode(payload, private_key, algorithm='ES384')

response = requests.post(TOKEN_URL, data={
    'grant_type': 'client_credentials',
    'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    'client_assertion': signed_jwt,
}, headers={'Content-Type': 'application/x-www-form-urlencoded'})

access_token = response.json()['access_token']
```

  </TabItem>
</BrowserOnlyTabs>

On success, the response is a standard OAuth2 token response:

```json
{
  "token_type": "Bearer",
  "access_token": "<YOUR_AUTH_TOKEN>",
  "expires_in": 3600
}
```

The `access_token` can then be used in subsequent API requests as a `Bearer` token.

## Error Reference

| `error_description` | Cause |
|---------------------|-------|
| `Invalid client assertion` | The `client_assertion` field is empty or not a valid JWT. |
| `Client not found` | The `iss`/`sub` in the JWT does not match any `ClientApplication` ID. |
| `Client must have a JWK Set URL` | The matching `ClientApplication` has no `jwksUri` configured. |
| `Invalid client assertion audience` | The `aud` claim does not match the Medplum token endpoint URL. |
| `Invalid client assertion issuer` | The `iss` claim does not match the `ClientApplication` ID. |
| `Invalid client assertion signature` | The JWT signature could not be verified against any key in the JWKS. |
| `Unsupported client assertion type` | The `client_assertion_type` value is not `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`. |

## Further Reading

- [RFC 7523 — JWT Profile for OAuth 2.0 Client Authentication](https://datatracker.ietf.org/doc/html/rfc7523)
- [RFC 7517 — JSON Web Key (JWK)](https://datatracker.ietf.org/doc/html/rfc7517)
- [SMART on FHIR Backend Services](https://hl7.org/fhir/smart-app-launch/backend-services.html)
- [Client Credentials Flow](./client-credentials)
- [Mutual TLS (mTLS)](./mtls)
