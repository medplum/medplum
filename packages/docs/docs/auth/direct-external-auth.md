---
sidebar_position: 10
tags: [auth]
---

# Direct External Authentication

Medplum supports authenticating users directly with an external Identity Provider (IDP) access token, without requiring a token exchange or authorization code flow. This is useful when your application already holds a valid JWT from an external IDP and wants to access the Medplum API directly.

:::caution Self-Hosted Deployments Only

This feature requires super admin privileges to configure `externalAuthProviders` in the [server config](/docs/self-hosting/server-config), which is only available on self-hosted Medplum deployments. If you are using Medplum's cloud-hosted service and need this capability, please contact [Medplum support](https://www.medplum.com/contact).

:::

## Overview

When a user presents a JWT issued by a configured external auth provider, Medplum can:

1. Validate the token against the IDP's userinfo endpoint
2. Identify the user from claims in the token
3. Return Medplum auth credentials for subsequent API access

There are two ways to identify the user from the token:

| Method | JWT Claim | Lookup | Best for |
| :--- | :--- | :--- | :--- |
| **FHIR User** | `fhirUser` | Profile reference or search | SMART-on-FHIR compliant IDPs |
| **Subject** | `sub` | `ProjectMembership.externalId` | Standard OIDC IDPs |

If both `fhirUser` and `sub` are present, the `fhirUser` claim takes precedence.

## Server Configuration

Add external auth providers to your Medplum server configuration:

```json
{
  "externalAuthProviders": [
    {
      "issuer": "https://your-idp.example.com",
      "userInfoUrl": "https://your-idp.example.com/oauth2/userinfo"
    }
  ]
}
```

| Field | Description |
| :--- | :--- |
| `issuer` | The `iss` claim value in JWTs from this IDP |
| `userInfoUrl` | The IDP's userinfo endpoint, used to validate tokens |

## Using the `fhirUser` Claim

The `fhirUser` claim contains a FHIR resource reference identifying the user's profile. It can be provided in several formats:

- **Direct reference**: `Practitioner/abc123`
- **Search string**: `Practitioner?identifier=1234567890`
- **Absolute URL**: `https://idp.example.com/fhir/Practitioner?identifier=1234567890`

Some IDPs place custom claims inside an `ext` block. Medplum also checks `ext.fhirUser` for compatibility.

### How it works

1. Medplum extracts the `fhirUser` claim from the JWT
2. Validates the token against the IDP's userinfo endpoint
3. Searches for the FHIR profile resource matching the claim
4. Finds the `ProjectMembership` associated with that profile
5. Returns auth credentials scoped to that membership

## Using the `sub` Claim

The `sub` (subject) claim is a standard JWT claim (RFC 7519) present in virtually all JWTs. When no `fhirUser` claim is present, Medplum uses the `sub` claim to look up a `ProjectMembership` by its `externalId` field.

### Setup

1. Configure the external auth provider in your server config (see above)
2. Invite users with an `externalId` matching their IDP `sub` value:

```bash
curl 'https://BASE_URL/admin/projects/PROJECT_ID/invite' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "resourceType": "Practitioner",
    "firstName": "Jane",
    "lastName": "Smith",
    "externalId": "IDP_SUBJECT_ID"
  }'
```

Replace `BASE_URL`, `PROJECT_ID`, and `ACCESS_TOKEN` with your actual values.

The `externalId` value should match the `sub` claim that the IDP assigns to this user.

:::tip

To find a user's `sub` value, decode the JWT from your IDP or check the IDP's user management console. For Auth0, the subject may be prefixed with the identity provider (e.g., `google-oauth2|110925489055200000000`). Use the full value as the `externalId`.

:::

### How it works

1. Medplum parses the JWT and finds no `fhirUser` claim
2. Extracts the `sub` claim
3. Validates the token against the IDP's userinfo endpoint
4. Searches for a `ProjectMembership` where `externalId` matches the `sub` value
5. Returns auth credentials scoped to that membership

:::caution Uniqueness

The `externalId` must be unique across all project memberships. If multiple memberships share the same `externalId`, authentication will fail with a `401` response to prevent ambiguity.

:::

## Making Requests

Once configured, make requests to the Medplum FHIR API using the external IDP token directly:

```bash
curl 'https://${baseUrl}/oauth2/userinfo' \
  -H 'Authorization: Bearer ${externalAccessToken}'
```

A successful response returns the user's profile information and Medplum login credentials. Subsequent requests to the FHIR API can use the returned Medplum access token.

Medplum caches external auth results in Redis for 1 hour to minimize calls to the IDP's userinfo endpoint.

## Comparison with Token Exchange

| | Direct External Auth | [Token Exchange](/docs/auth/token-exchange) |
| :--- | :--- | :--- |
| **Endpoint** | `/oauth2/userinfo` | `/oauth2/token` |
| **Configuration** | Server-level `externalAuthProviders` | Per-`ClientApplication` identity provider |
| **Token format** | Uses external JWT directly | Exchanges for Medplum access token |
| **User lookup** | `fhirUser` claim or `sub` / `externalId` | Email or `sub` (via `useSubject` flag) |

Choose **Direct External Auth** when you want to use external JWTs directly without an explicit token exchange step. Choose **Token Exchange** when you need a standard Medplum access token or when the auth flow is scoped to a specific `ClientApplication`.
