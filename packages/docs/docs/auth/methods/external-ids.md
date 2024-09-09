---
sidebar_position: 8
tags: [auth]
---

# Using External IDs

By default, Medplum uses email address as a unique identifier for a user. When using External Identity Providers, you may instead want to use the external ID rather than email. This document describes the additional changes to use external ID.

## Configure client

Navigate to "Project Admin" and then "Clients".

Find your Client Application.

Set `ClientApplication.identityProvider.useSubject` to `true`

## Invite user

Prepare JSON payload:

```json
{
  "resourceType": "Patient",
  "firstName": "Homer",
  "lastName": "Simpson",
  "externalId": "MY_EXTERNAL_ID"
}
```

:::tip

Auth0 can optionally prefix subject with the identity provider, such as "google-oauth2|110925489055200000000". Only use the portion after the "|" such as "110925489055200000000".

:::

Then POST to the `/invite` endpoint:

```bash
curl 'https://${baseUrl}/admin/projects/${projectId}/invite' \
  -H 'Authorization: Bearer ${accessToken}' \
  -H 'Content-Type: application/json' \
  --data-raw '{"resourceType":"Patient","firstName":"Homer","lastName":"Simpson","externalId":"110925489055200000000"}'
```

## Login example

You can then use the external auth provider as described in [External Identity Providers](./external-identity-providers)

This will also work with the example repo:

> [https://github.com/medplum/medplum-client-external-idp-demo](https://github.com/medplum/medplum-client-external-idp-demo)
