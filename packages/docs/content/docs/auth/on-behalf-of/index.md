---
id: on-behalf-of
title: On-Behalf-Of Delegation
weight: 310
docs_tags: [auth]
---

On-Behalf-Of lets your backend use one privileged `ClientApplication` as its machine-to-machine identity and supply a user's membership context for each Medplum request. This is the decision guide's [single machine-to-machine user approach](/docs/decision-guides/authentication#option-c-on-behalf-of-single-machine-to-machine-user). Medplum applies the delegated membership's access policy and records the application and delegated profile on resource writes.

Use this page to implement delegation with an application credential. For a backend using exchanged user credentials, follow [server-held token exchange](/docs/auth/token-exchange#server-held-medplum-tokens).

## Overview

Consider this common Medplum architectural pattern:

![On-Behalf-Of](on-behalf-of.webp)

Your backend authenticates the person using your application's login system, resolves the corresponding Medplum membership, and attaches that context to outgoing Medplum requests. Derive the delegation header from the verified identity and authorized application context.

{{< warning title="Use On-Behalf-Of for FHIR API requests" >}}
The safest use of On-Behalf-Of is for FHIR API requests under `/fhir/R4/`, where the delegated membership's access policy controls the response. Endpoints outside the FHIR API, such as `/auth/`, `/oauth2/`, `/admin/`, and `/scim/`, manage sessions, credentials, accounts, and project settings. They do not all handle delegation the same way. If your backend sends delegated requests to these endpoints, test each one with each type of delegated membership you use, and confirm the behavior before you release. See [Security Considerations](#security-considerations).
{{< /warning >}}

## How to Use

### Authenticate the application

Authenticate your backend as a `ClientApplication` with [Project Admin](/docs/access/admin#project-admin) rights. Follow [Client Credentials](/docs/auth/client-credentials) to obtain an application access token. On-Behalf-Of also supports Basic Authentication. Keep these application credentials on the trusted backend.

### Resolve and attach user context

Authenticate the incoming user request and resolve its Medplum membership using a mapping controlled by your backend. Include the `X-Medplum-On-Behalf-Of` header on each outgoing request. The value can be either:

1. A membership reference, `ProjectMembership/{id}`. This explicitly selects the membership stored in your backend's mapping.
2. A profile reference, such as `Patient/{id}` or `Practitioner/{id}`. Medplum looks up the corresponding `ProjectMembership` in the application's project.

For more information on `ProjectMemberships` and profile resources, see the [User Management Guide](/docs/user-management).

Include the header on every delegated request. Medplum resolves the delegation context for that request, and resource versions created or updated under that context retain the delegated profile in `meta.onBehalfOf`.

### Handle missing or invalid context

Without the header, Medplum uses the application's own access. A valid header for a different user can delegate to that user. Reject requests with missing or inconsistent user context before calling Medplum, and do not forward an arbitrary delegation header supplied by the caller.

Treat a rejected delegation request as a failure; do not retry it without the header. Keep privileged application operations separate from handlers serving user requests.

### Lock down the application credential

The On-Behalf-Of model is designed to use individual users' `ProjectMembership`s while authenticating through a single machine-to-machine user. We recommend configuring the `ClientApplication` used for server-to-server communication with a "least permissive" AccessPolicy, including IP access rules:

```json
{
  "resourceType": "AccessPolicy",
  "name": "On-Behalf-Of backend",
  "resource": [],
  "ipAccessRule": [
    { "name": "Backend egress", "value": "203.0.113.10", "action": "allow" },
    { "name": "Block everything else", "value": "*", "action": "block" }
  ]
}
```

- Delegated requests use only the delegated membership's access policy, so this policy doesn't limit what users can do.
- Requests without the header can't read or write clinical data.
- [IP Access Rules](/docs/access/ip-access-rules) are checked on every `client_credentials` token request and every Basic auth request.

### Live updates

Do not use On-Behalf-Of for WebSocket subscriptions. Use a user-scoped Medplum token, or deliver updates through a backend that enforces each recipient's resource and field-level access. WebSocket notification authorization does not preserve the HTTP request's delegation context.

## Security Considerations

The application credential has Project Admin rights, and the delegated membership's access policy is often the only control on what a delegated request can do. Combined with a backend that forwards requests too freely, this setup can expose that credential to an end user. Review the following before you put a delegating backend in front of end users.

### Forward an allowlist of requests

Do not build a passthrough proxy that forwards any path, method, or body supplied by the browser. Define the specific requests that each handler needs, such as reading `Patient` resources or creating `Observation` resources, and reject everything else.

- Restrict delegated requests to FHIR API paths under `/fhir/R4/`. Within the FHIR API, allow only the resource types and operations your application uses.
- Do not forward requests from end users to `/auth/`, `/oauth2/`, `/admin/`, `/scim/`, `/email/`, or `/keyvalue/`. These endpoints act on sessions, credentials, accounts, and project configuration. Some reject delegation. Others honor it or act on the application's own login. For example, `/auth/preauthorize` creates a sign-in code for the delegated user, and a logout request can end the application's session instead of a user session.
- Remove any `Authorization`, `X-Medplum-On-Behalf-Of`, or other `X-Medplum-*` headers that the caller sent before you add your own.
- Return only the fields your frontend needs, rather than passing Medplum responses through unchanged.

### Give each delegated membership a restrictive access policy

Medplum checks every delegated FHIR request against the delegated membership's access policy. That policy is the main control on what the end user can see and change.

- Assign an explicit [access policy](/docs/access/access-policies) to every membership you delegate to. A `ProjectMembership` without an access policy has full read and write access to the project's resources, including `ClientApplication` resources and their secrets.
- Exclude `ClientApplication`, `Bot`, and other configuration resources from end-user policies. If a role needs to read `ClientApplication`, add `secret` and `retiringSecret` to [hidden fields](/docs/access/access-policies#hidden-elements).
- Do not delegate end-user requests to Project Admin memberships. A delegated admin membership has admin rights, including on the `/admin/` endpoints.

### Protect the application credential

- Store the client ID and secret only on the backend, and never return them to the browser.
- Use a dedicated `ClientApplication` for each delegating backend, so you can identify its traffic and revoke it on its own.
- If you suspect that a client secret was exposed, rotate it with [`$rotate-secret`](/docs/api/fhir/operations/rotate-client-secret), and review the `AuditEvent` resources and resource history created by that application.

## How it Works

When the Medplum Server receives a request with the `X-Medplum-On-Behalf-Of` header, it will:

1. Authenticate the application and check its Project Admin authority.
2. Resolve the header to a `ProjectMembership` and its profile. The membership and its project must be active. Project Admin delegation stays within the application's project. Super admin context can delegate across projects using an explicit `ProjectMembership/{id}` reference; profile references always resolve in the application's project.
3. Apply the delegated membership's access policy and any SMART resource scopes on the application's login.
4. Execute the request. On resource creates and updates, record the application in `meta.author` and the delegated profile reference in `meta.onBehalfOf`. Read responses retain the attribution stored on the resource version.

## Example

Here is a curl example of using the `X-Medplum-On-Behalf-Of` header:

{{< code-example file="packages/examples/src/auth/on-behalf-of.ts" language="bash" blocks="curlExample" >}}

Here is the same example using the Medplum SDK:

{{< code-example file="packages/examples/src/auth/on-behalf-of.ts" language="ts" blocks="createResourceOnBehalfOf" >}}

For a client dedicated to one delegated membership, you can set the header at construction. Keep that client isolated to the selected user context:

{{< code-example file="packages/examples/src/auth/on-behalf-of.ts" language="ts" blocks="defaultHeadersOnBehalfOf" >}}

Note the two extra HTTP request headers:

1. `X-Medplum: extended` - This is required to enable the extended Medplum API features, such as `meta.author` and `meta.onBehalfOf`.
2. `X-Medplum-On-Behalf-Of` - A membership reference (`ProjectMembership/{id}`) or profile reference identifying the user context for this request.

Here is the resulting FHIR JSON:

```json
{
  "resourceType": "Patient",
  "id": "00000000-689b-4e20-a3c2-6f55108b432a",
  "meta": {
    "versionId": "00000000-b58b-47c8-9fc0-f85627d333c9",
    "lastUpdated": "2024-07-13T21:18:45.850Z",
    "author": {
      "reference": "ClientApplication/00000000-d361-46f0-adf4-f56da467dc08",
      "display": "My Client"
    },
    "onBehalfOf": {
      "reference": "Practitioner/00000000-9886-4b83-a25a-3b99563b8127",
      "display": "My Test User"
    }
  },
  "name": [{ "given": ["Homer"], "family": "Simpson" }]
}
```
