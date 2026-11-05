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
  "externalId": "google-oauth2|110925489055200000000"
}
```

:::tip[]

Use the complete `sub` value returned by your provider, including any prefix. For example, provision an Auth0 subject of `google-oauth2|110925489055200000000` with that exact external ID. Both the external IDP callback and token exchange use the complete subject for matching.

:::

Then POST to the `/invite` endpoint:

```bash
curl 'https://api.medplum.com/admin/projects/MY_PROJECT_ID/invite' \
  -H 'Authorization: Bearer MY_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  --data-raw '{"resourceType":"Patient","firstName":"Homer","lastName":"Simpson","externalId":"google-oauth2|110925489055200000000"}'
```

## Login example

You can then use the external auth provider as described in [External Identity Providers](/docs/auth/external-identity-providers)

This will also work with the example repo:

> [https://github.com/medplum/medplum-client-external-idp-demo](https://github.com/medplum/medplum-client-external-idp-demo)
