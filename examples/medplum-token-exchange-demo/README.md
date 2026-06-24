# Medplum Server Side Token Exchange Example

A small Node.js script that demonstrates **server side token exchange** against a Medplum server.

It takes an access token issued by an **external identity provider (IdP)** and exchanges it for a
Medplum access token using the OAuth2 [Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
grant. It can optionally target a specific `ProjectMembership` via `membership_id`, which lets the
same external identity authenticate into a project other than the client's own project.

This is the machine-to-machine counterpart to the browser based
[medplum-client-external-idp-demo](../medplum-client-external-idp-demo): no redirect/PKCE flow,
just a direct token exchange suitable for backend services and integration tests.

## How it works

The script calls `MedplumClient.exchangeExternalAccessToken(externalAccessToken, clientId, membershipId)`,
which posts to `/oauth2/token` with:

```
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token_type=urn:ietf:params:oauth:token-type:access_token
client_id=<MEDPLUM_CLIENT_ID>
subject_token=<external access token>
membership_id=<optional ProjectMembership id>
```

The server uses `client_id` to find the matching external auth provider, validates the external
token against that provider's `userInfoUrl`, then issues a Medplum login.

## Setting up the External IdP

You configure the external IdP in **one** of two places depending on your deployment.

### Self-hosters: server config (`externalAuthProviders`)

Add an `externalAuthProviders` entry to your Medplum server config. The `clientId` is the selector
you pass to this script as `MEDPLUM_CLIENT_ID`. If you omit the top-level `clientId`, the server
falls back to `identityProvider.clientId`.

```json
{
  "externalAuthProviders": [
    {
      "issuer": "https://your-idp.example.com",
      "clientId": "your-token-exchange-selector",
      "identityProvider": {
        "authorizeUrl": "https://your-idp.example.com/oauth2/authorize",
        "tokenUrl": "https://your-idp.example.com/oauth2/token",
        "userInfoUrl": "https://your-idp.example.com/oauth2/userinfo",
        "clientId": "your-idp-client-id",
        "clientSecret": "your-idp-client-secret"
      }
    }
  ]
}
```

A minimal provider with only a `userInfoUrl` is also supported:

```json
{
  "externalAuthProviders": [
    {
      "issuer": "https://your-idp.example.com",
      "clientId": "your-token-exchange-selector",
      "userInfoUrl": "https://your-idp.example.com/oauth2/userinfo"
    }
  ]
}
```

Restart the server after updating the config. Then set `MEDPLUM_CLIENT_ID` to the provider's
`clientId` (or its `identityProvider.clientId`).

> Because the provider is defined at the server level, you can pass any `membership_id` and the
> server derives the project from that membership — the identity is not tied to a single project.

### Hosted Medplum: `ClientApplication` in your project

On hosted Medplum (`https://api.medplum.com/`), configure the external IdP on a `ClientApplication`
in your project:

1. [Register / sign in](https://www.medplum.com/docs/tutorials/register) to your Medplum project.
2. Create a `ClientApplication` (Project Admin → Clients).
3. Add an **Identity Provider** to that client with your IdP's Authorize URL, Token URL,
   UserInfo URL, Client ID, and Client Secret.
4. Use the `ClientApplication`'s **ID** as `MEDPLUM_CLIENT_ID`.

See [Token Exchange](https://www.medplum.com/docs/auth/methods/token-exchange) and
[External Identity Providers](https://www.medplum.com/docs/auth/methods/external-identity-providers)
for full details.

## Usage

```bash
npm install
cp .env.example .env
# edit .env with your values
npm run exchange-for-medplum-token
```

### Configuration (`.env`)

| Variable                 | Required | Description                                                                                         |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------- |
| `MEDPLUM_BASE_URL`       | No       | Medplum server URL. Defaults to `http://localhost:8103/`.                                           |
| `MEDPLUM_CLIENT_ID`      | Yes      | External auth provider selector (server `externalAuthProviders` clientId, or ClientApplication id). |
| `MEDPLUM_MEMBERSHIP_ID`  | No       | A specific `ProjectMembership` id to authenticate into.                                             |
| `EXTERNAL_ACCESS_TOKEN`  | Maybe    | Access token from your external IdP. Provide this **or** the `EXTERNAL_*` fetch fields below.       |
| `EXTERNAL_TOKEN_URL`     | Maybe    | External IdP token endpoint, used to fetch a token via `client_credentials`.                        |
| `EXTERNAL_CLIENT_ID`     | Maybe    | External IdP client ID for the `client_credentials` fetch.                                          |
| `EXTERNAL_CLIENT_SECRET` | Maybe    | External IdP client secret for the `client_credentials` fetch.                                      |
| `EXTERNAL_SCOPE`         | No       | Optional scope for the `client_credentials` fetch.                                                  |

You must supply the external token in one of three ways:

- **Interactive login (recommended)**: run `npm run get-external-token` (see below) to log in as a real
  user and have the token written to `EXTERNAL_ACCESS_TOKEN` automatically.
- **Directly**: set `EXTERNAL_ACCESS_TOKEN` to a token you already obtained from your IdP.
- **Fetched for you**: set `EXTERNAL_TOKEN_URL`, `EXTERNAL_CLIENT_ID`, and `EXTERNAL_CLIENT_SECRET`,
  and the script will request one using the OAuth2 `client_credentials` grant. (Note: `client_credentials`
  tokens have no user, so they won't work with IdP userinfo endpoints like Okta's.)

## Getting a token interactively (`npm run get-external-token`)

`npm run get-external-token` runs a vendor-neutral OAuth2 **authorization-code** login (with PKCE) against any IdP.
It opens your IdP's hosted login page in the browser, captures the redirect on a local listener,
exchanges the code for an access token, and writes it into `.env` as `EXTERNAL_ACCESS_TOKEN`.

Configure these in `.env` (examples for several vendors are in `.env.example`):

| Variable            | Required | Description                                                                                                 |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `IDP_AUTHORIZE_URL` | Yes      | IdP authorization endpoint (e.g. `https://<org>.okta.com/oauth2/v1/authorize`).                             |
| `IDP_TOKEN_URL`     | Yes      | IdP token endpoint (e.g. `https://<org>.okta.com/oauth2/v1/token`).                                         |
| `IDP_CLIENT_ID`     | Yes      | The IdP application's client ID.                                                                            |
| `IDP_CLIENT_SECRET` | No       | Client secret for confidential clients. Omit for public clients (PKCE only).                                |
| `IDP_REDIRECT_URI`  | No       | Redirect/callback URI. Defaults to `http://localhost:8000/callback`. **Must be registered on the IdP app.** |
| `IDP_SCOPE`         | No       | Scopes to request. Defaults to `openid email profile`.                                                      |

Then:

```bash
npm run get-external-token   # log in via browser -> writes EXTERNAL_ACCESS_TOKEN
npm run exchange-for-medplum-token       # run the token exchange
```

The user you log in as must resolve to a Medplum `User`/`ProjectMembership` (matched by email) in the
target project, or pass `MEDPLUM_MEMBERSHIP_ID`.

### Example output

```
Medplum base URL: http://localhost:8103/
Client ID (external auth selector): your-token-exchange-selector
Membership ID: 1a2b3c4d-...
Obtained external access token.

Token exchange succeeded.
Profile: Practitioner/abc123 (Alice Smith)
Project: Project/def456
Membership: ProjectMembership/1a2b3c4d-...
Access token (truncated): eyJhbGciOiJSUzI1...
```
