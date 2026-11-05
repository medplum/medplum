---
sidebar_position: 30
tags: [auth]
---

import ExampleCode from '!!raw-loader!@site/..//examples/src/auth/on-behalf-of.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# On-Behalf-Of

On-Behalf-Of lets your backend authenticate as a privileged `ClientApplication` and supply a user's membership context for each Medplum request. Medplum applies the delegated membership's access policy and records the application and delegated profile on resource writes.

Use this page to implement delegation with an application credential. For a backend using exchanged user credentials, follow [server-held token exchange](/docs/auth/token-exchange#server-held-medplum-tokens).

## Overview

Consider this common Medplum architectural pattern:

![On-Behalf-Of](./on-behalf-of.webp)

Your backend authenticates the person using your application's login system, resolves the corresponding Medplum membership, and attaches that context to outgoing Medplum requests. Derive the delegation header from the verified identity and authorized application context.

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

## How it Works

When the Medplum Server receives a request with the `X-Medplum-On-Behalf-Of` header, it will:

1. Authenticate the application and check its Project Admin authority.
2. Resolve the header to a `ProjectMembership` and its profile. The membership must be active and in the application's project; super admin context can delegate across projects.
3. Apply the delegated membership's access policy and any SMART resource scopes on the application's login.
4. Execute the request. On resource creates and updates, record the application in `meta.author` and the delegated profile reference in `meta.onBehalfOf`. Read responses retain the attribution stored on the resource version.

## Example

Here is a curl example of using the `X-Medplum-On-Behalf-Of` header:

<MedplumCodeBlock language="bash" selectBlocks="curlExample">
  {ExampleCode}
</MedplumCodeBlock>

Here is the same example using the Medplum SDK:

<MedplumCodeBlock language="ts" selectBlocks="createResourceOnBehalfOf">
  {ExampleCode}
</MedplumCodeBlock>

For a client dedicated to one delegated membership, you can set the header at construction. Keep that client isolated to the selected user context:

<MedplumCodeBlock language="ts" selectBlocks="defaultHeadersOnBehalfOf">
  {ExampleCode}
</MedplumCodeBlock>

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
