---
id: api-proxy-security
title: API Proxy Security
weight: 320
docs_tags: [auth]
---

Some applications put their own API server in front of Medplum, forwarding requests on behalf of their users. This is often called an API proxy. It's a flexible pattern for custom business logic and integrations, but the proxy becomes part of your security boundary: it holds credentials, decides which user each request represents, and controls what reaches Medplum.

Medplum still enforces authentication, project isolation, and access policies on every request. It cannot verify that your proxy authenticated the right user or forwarded only what that user should be able to do. This page covers the practices we recommend for proxies, whether they use [token exchange](/docs/auth/token-exchange#server-held-medplum-tokens), [On-Behalf-Of](/docs/auth/on-behalf-of), or a dedicated `ClientApplication`.

## Configure the client

Use a [project-scoped URL](/docs/access/project-scoped-urls) and disable SDK caching explicitly:

```ts
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/projects/YOUR_PROJECT_ID/',
  cacheTime: 0,
});
```

- **Project-scoped URL:** credentials issued for another project are rejected. Get tokens and make requests through the same base URL, since project-scoped tokens are bound to it.
- **`cacheTime: 0`:** `MedplumClient` caches reads by default in browser-like environments, detected by whether `window` is defined. Server runtimes don't always detect cleanly, so set it explicitly. This only controls the SDK cache; make sure your framework, HTTP layer, and CDN don't cache authenticated responses either.

## Isolate user state

If requests run as different users (for example, with per-user tokens from token exchange), don't share a `MedplumClient` instance across concurrent requests. Create a client per request, or otherwise guarantee that one user's credentials can't be used for another user's request.

A single shared client is fine when every request runs as the same application identity.

## Protect application credentials

A `ClientApplication` used by a proxy is a privileged machine identity. Layer independent controls:

- **Least privilege:** grant only the access the proxy needs. For On-Behalf-Of, see [Lock down the application credential](/docs/auth/on-behalf-of#lock-down-the-application-credential).
- **IP restrictions:** allow only your servers' egress IPs with [IP Access Rules](/docs/access/ip-access-rules).
- **Secret storage:** keep client secrets in a secrets manager, never in browser bundles, repositories, or logs.
- **Separate environments:** use different `ClientApplication`s for development, staging, and production.
- **Stronger authentication:** consider [Mutual TLS](/docs/auth/mtls) or [Client Assertion](/docs/auth/client-assertion) instead of a shared secret.

## Delegate safely with On-Behalf-Of

On-Behalf-Of requires a Project Admin `ClientApplication`, so the proxy decides which user each request represents:

- Authenticate every incoming request before calling Medplum.
- Resolve the target `ProjectMembership` from a server-side mapping of the authenticated user. Never forward an `X-Medplum-On-Behalf-Of` header or membership ID supplied by the caller.
- Set the header explicitly on every delegated request.
- **Fail closed.** A request without the header runs with the application's own access. If user context is missing or invalid, reject the request; never retry it without the header.

Where it meets your requirements, prefer [server-held token exchange](/docs/auth/token-exchange#server-held-medplum-tokens), where each Medplum credential represents the user rather than the application.

## Forward only what you need

Don't expose the full Medplum API through your proxy. Allowlist the routes, HTTP methods, and resource types your application uses. Many applications only need part of `/fhir/R4/`.

- Keep administrative resources (`Project`, `ProjectMembership`, `AccessPolicy`, `ClientApplication`, etc.) out unless explicitly required.
- Don't forward `/auth/` or `/oauth2/` unless your application needs them. If it does, allow only the specific operations required. These endpoints are especially risky behind privileged application credentials.
- Validate the effective operation, not just a path prefix. FHIR requests include searches, `$operations`, `_history`, and batch/transaction bundles that can reach other resource types.

## Treat every request as untrusted

Assume attackers will call your proxy directly, with arbitrary paths, query parameters, headers, and methods, not just what your UI sends.

- Don't let user input choose the upstream URL, project, credential, or authentication context.
- Don't blindly forward `Authorization`, `X-Medplum-On-Behalf-Of`, or other security-sensitive headers.
- Apply the same authorization checks across every route and HTTP method.

## Test from an attacker's perspective

Include these cases in automated integration tests, and supplement them with periodic security reviews or penetration testing:

| Scenario               | Verify that                                                                       |
| :--------------------- | :-------------------------------------------------------------------------------- |
| Cross-project access   | Tokens or identities from another project can't reach your data through the proxy |
| Cross-user access      | One user can't read or write another user's data                                  |
| Missing authentication | Unauthenticated requests are rejected                                             |
| Missing delegation     | Requests never fall back to the application's own permissions                     |
| Unexpected routes      | Unlisted resources, admin resources, and auth endpoints are rejected              |
| Concurrent sessions    | Simultaneous users never share credentials or cached responses                    |
| Credential exposure    | Secrets and tokens never appear in responses, logs, or error messages             |

## Related

- [Authentication Decision Guide](/docs/decision-guides/authentication)
- [On-Behalf-Of Delegation](/docs/auth/on-behalf-of)
- [Token Exchange](/docs/auth/token-exchange)
- [Project-Scoped URLs](/docs/access/project-scoped-urls)
- [Access Policies](/docs/access/access-policies)
