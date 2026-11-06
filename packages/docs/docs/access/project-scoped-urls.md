---
sidebar_position: 3
tags: [auth]
---

# Project-Scoped URLs

Medplum serves its API under project-scoped base URLs in addition to the standard root URL. A project-scoped URL names the target [Project](/docs/access/projects) in the path, and Medplum verifies that every authenticated request made through it belongs to that project.

Project-scoped URLs give each tenant its own API endpoint, OAuth issuer, and discovery documents. They also add a layer of tenant isolation: credentials issued for one project's endpoint cannot be used against another project's endpoint.

## URL Format

Every API route is available under two project-scoped prefixes:

```text
https://api.medplum.com/projects/{projectId}/...
https://api.medplum.com/api/projects/{projectId}/...
```

For example, the FHIR endpoint for a project is:

```text
https://api.medplum.com/projects/{projectId}/fhir/R4/
```

Project-scoped URLs cover the full API surface, including FHIR, Binary, asynchronous batch, OAuth, DICOMweb, and subscription WebSockets. The root URLs (`https://api.medplum.com/...` and `https://api.medplum.com/api/...`) remain available and unchanged.

## Security Model

### The URL asserts the project, the credential decides it

The project ID in the URL is an assertion that Medplum checks. It is never a source of identity or access.

When an authenticated request arrives on a project-scoped URL, Medplum resolves the caller's identity exactly as it does on the root URL: from the credential to the `Login`, then to the `ProjectMembership`, then to the `Project`. Medplum then compares that project to the project ID in the URL. If they differ, the request is rejected with `403 Forbidden`.

The project ID in the URL does not:

- Grant access to the project
- Select a membership for a user who belongs to several projects
- Change which repository or data the request reads and writes
- Bypass or relax [Access Policies](/docs/access/access-policies), [IP Access Rules](/docs/access/ip-access-rules), or [SMART scopes](/docs/access/smart-scopes)

Project IDs are identifiers, not secrets. Knowing a project ID gives a caller nothing without a valid credential for that project.

### Tokens are bound to the URL scope that issued them

Each project-scoped URL acts as its own OAuth issuer. The issuer for a project is:

```text
https://api.medplum.com/projects/{projectId}/
```

When a client obtains tokens through a project-scoped token endpoint, Medplum sets both the `iss` and `aud` claims of the access token to the project-scoped issuer. When a request arrives, Medplum verifies the token against the issuer implied by the request URL. The same applies to refresh tokens, token introspection, and `id_token_hint` during authorization.

As a result, a token is only accepted under the URL scope where it was issued:

| Token issued through     | Used at root URL | Used at project A URL | Used at project B URL |
| ------------------------ | ---------------- | --------------------- | --------------------- |
| Root token endpoint      | Accepted         | Rejected              | Rejected              |
| Project A token endpoint | Rejected         | Accepted              | Rejected              |

A leaked or misrouted project-scoped token cannot be replayed against the root API or against another project's endpoint. The `/api` and non-`/api` forms of the same project URL share an issuer, so a token works under both.

### Client assertions are audienced to the project

[Client assertion](/docs/auth/client-assertion) authentication (private key JWT) requires the `aud` claim to match the token endpoint URL. On a project-scoped URL, that is the project-scoped token endpoint:

```text
https://api.medplum.com/projects/{projectId}/oauth2/token
```

An assertion created for one project's token endpoint is rejected by the root token endpoint and by every other project's token endpoint.

### Discovery stays within the project scope

Discovery documents fetched from a project-scoped URL advertise only project-scoped endpoints. A client that begins discovery at a project URL is never redirected to the root issuer or to another project.

| Document                     | Project-scoped path                                          |
| ---------------------------- | ------------------------------------------------------------ |
| OpenID Connect configuration | `/projects/{projectId}/.well-known/openid-configuration`     |
| SMART configuration          | `/projects/{projectId}/.well-known/smart-configuration`      |
| OAuth protected resource     | `/projects/{projectId}/.well-known/oauth-protected-resource` |

The OpenID configuration advertises project-scoped `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `introspection_endpoint`, `registration_endpoint`, and `jwks_uri` values.

### Subscription WebSockets enforce the project

A subscription WebSocket opened on a project-scoped URL must bind to a subscription in the same project. If the subscription belongs to a different project, Medplum sends a `403 Forbidden` outcome and does not bind the subscription.

### External JWTs can be scoped to a project

Some external systems issue JWTs that identify the issuer but carry no Medplum project, user, or profile. On a project-scoped URL, Medplum can accept these tokens directly as bearer tokens by matching the token issuer to a `ClientApplication` in that project.

This lookup only runs on project-scoped URLs and is designed to fail closed:

- The JWT signature is verified against the `jwksUrl` configured on the client's identity provider.
- The JWT `iss` claim must match the identity provider's configured `issuer`.
- The client lookup is constrained to the project named in the URL.
- Exactly one `ClientApplication` in the project must match the issuer. Zero or multiple matches are rejected.
- The request authenticates as the client's existing `ProjectMembership`. A token never creates a membership or grants access by itself.

Server-wide `externalAuthProviders` are checked first, as described in [Direct External Authentication](/docs/auth/direct-external-auth).

## What Project-Scoped URLs Do Not Do

Project-scoped URLs strengthen isolation for clients that use them. They are not a project-level access control on their own.

- **Root URLs still work.** A client with valid credentials for a project can still call the root API. Project-scoped URLs do not force a project's traffic through its scoped endpoint.
- **Sign-in and token issuance are not restricted by the URL.** Login, registration, and the token endpoint behave as they do on the root URL, and do not check the project in the URL. A user or client from project B can obtain tokens through project A's endpoint, but every API request rejects those tokens. They fail the project check with `403 Forbidden` on project A's URL, and fail issuer verification with `401 Unauthorized` everywhere else.
- **Access control is unchanged.** Access Policies, SMART scopes, and IP Access Rules apply exactly as they do on the root URL.

## When to Use Project-Scoped URLs

Use project-scoped URLs when:

- **An integration needs a distinct endpoint per tenant.** ONC endpoint discovery and CMS-0057-F Coverage Requirements Discovery (CRD) testing both expect a tenant-specific base URL.
- **An external system's credentials do not identify the project.** Backend-service credentials and external JWTs that carry no Medplum identity need the URL to route them to the correct project.
- **You want defense in depth for multi-tenant integrations.** Binding tokens to a project issuer keeps a misconfigured or compromised client from reaching data outside its intended project.

## Using Project-Scoped URLs with the Medplum SDK

Set the client's `baseUrl` to the project-scoped URL. The client derives its FHIR, OAuth, and WebSocket URLs from the base URL, so every request uses the project scope.

```ts
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/projects/YOUR_PROJECT_ID/',
});

await medplum.startClientLogin(MY_CLIENT_ID, MY_CLIENT_SECRET);
```

Tokens obtained this way use the project-scoped issuer. Keep the same `baseUrl` for every request made with those tokens, since the root URL rejects them.

## Availability

Project-scoped URLs are available in Medplum v5.1.30 and later. DICOMweb and subscription WebSocket support was added in v5.1.38. No configuration is required.
