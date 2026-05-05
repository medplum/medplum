---
sidebar_position: 10.5
tags: [auth]
---

# Keycloak Authentication

This guide covers how to configure Keycloak as an external identity provider for Medplum using [Direct External Authentication](/docs/auth/direct-external-auth). With this setup, a Keycloak access token can be used directly as a Bearer token against the Medplum FHIR API — no token exchange required.

:::caution[Self-Hosted Deployments Only]

This feature requires super admin privileges to configure `externalAuthProviders` in the [server config](/docs/self-hosting/server-config), which is only available on self-hosted Medplum deployments.

:::

## Keycloak Client Configuration

In the Keycloak admin console, your client must be configured as follows:

**Access Settings**
| Setting | Value |
| :--- | :--- |
| Client authentication | On (confidential client) |
| Direct access grants | Enabled |

**Direct access grants** (also called the Resource Owner Password Credentials grant) is what allows token requests using a username and password directly. Without it, the token endpoint will reject requests with `Grant type 'password' not allowed`.

**Scopes**

Ensure the `openid` scope is available on the client. It is included by default in Keycloak but must be explicitly requested in the token call (see [Getting a Token](#getting-a-token-from-keycloak)).

## Server Configuration

Add your Keycloak realm as an external auth provider. The `issuer` must match the `iss` claim in Keycloak's JWTs, which includes the realm path.

```json
{
  "externalAuthProviders": [
    {
      "issuer": "https://your-keycloak-host/realms/your-realm",
      "userInfoUrl": "https://your-keycloak-host/realms/your-realm/protocol/openid-connect/userinfo"
    }
  ]
}
```

When configuring via environment variable:

```bash
export MEDPLUM_EXTERNAL_AUTH_PROVIDERS='[{"issuer":"https://your-keycloak-host/realms/your-realm","userInfoUrl":"https://your-keycloak-host/realms/your-realm/protocol/openid-connect/userinfo"}]'
```

:::tip

The `issuer` must be an exact match for the `iss` claim in the JWT. To verify what Keycloak puts in the `iss` claim, decode a token:

```bash
echo "<access_token>" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool | grep iss
```

:::

## Medplum ClientApplication Configuration

A `ClientApplication` in Medplum must be configured with an `identityProvider` pointing to your Keycloak realm. This tells Medplum how to communicate with Keycloak for token validation and user resolution.

```json
{
  "resourceType": "ClientApplication",
  "name": "Keycloak",
  "identityProvider": {
    "authorizeUrl": "https://your-keycloak-host/realms/your-realm/protocol/openid-connect/auth",
    "tokenUrl": "https://your-keycloak-host/realms/your-realm/protocol/openid-connect/token",
    "userInfoUrl": "https://your-keycloak-host/realms/your-realm/protocol/openid-connect/userinfo",
    "clientId": "YOUR_KEYCLOAK_CLIENT_ID",
    "clientSecret": "YOUR_KEYCLOAK_CLIENT_SECRET",
    "useSubject": true
  }
}
```

| Field | Description |
| :--- | :--- |
| `authorizeUrl` | Keycloak's authorization endpoint (used for redirect-based flows) |
| `tokenUrl` | Keycloak's token endpoint |
| `userInfoUrl` | Keycloak's userinfo endpoint, used to validate tokens |
| `clientId` | The client ID from your Keycloak client configuration |
| `clientSecret` | The client secret from your Keycloak client configuration |
| `useSubject` | Set to `true` to match users by `sub` claim instead of email |

Setting `useSubject: true` is recommended for Keycloak. When `false` (the default), Medplum matches users by email address, which requires the email in the Keycloak token to exactly match the email on the Medplum `User` resource.

You can create the `ClientApplication` via the Medplum app (**Project → Client Applications → New**) or via the API.

## Setting Up Users

Each Keycloak user must have a corresponding `ProjectMembership` in Medplum with an `externalId` matching their Keycloak `sub` claim.

Use the invite endpoint to create the membership:

```bash
curl 'https://BASE_URL/admin/projects/PROJECT_ID/invite' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "resourceType": "Practitioner",
    "firstName": "Jane",
    "lastName": "Smith",
    "externalId": "KEYCLOAK_USER_SUB"
  }'
```

To find a user's `sub`, decode their Keycloak JWT or check the Keycloak admin console under **Users → (user) → Details**.

## Getting a Token from Keycloak

Request a token from Keycloak's token endpoint with `scope=openid`:

```bash
curl -X POST https://your-keycloak-host/realms/your-realm/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&username=YOUR_USERNAME&password=YOUR_PASSWORD&scope=openid"
```

:::caution

`scope=openid` is required. Without it, Keycloak's userinfo endpoint returns `403 - Missing openid scope` and Medplum will reject the token with a `401`.

:::

If your username contains special characters, URL-encode them: `+` → `%2B`, `@` → `%40`.

## Making Requests to Medplum

Use the Keycloak `access_token` directly as a Bearer token:

```bash
curl https://your-medplum-host/fhir/R4/Patient \
  -H "Authorization: Bearer <access_token>"
```

Medplum will:
1. Match the JWT `iss` claim against the configured `issuer`
2. Call Keycloak's `userInfoUrl` to verify the token is live
3. Look up the `ProjectMembership` whose `externalId` matches the JWT `sub` claim
4. Return results scoped to that membership's project

Tokens are valid for the duration of the Keycloak token lifetime (default 5 minutes). Medplum caches auth results in Redis for 1 hour.
