---
sidebar_position: 8
tags: [auth]
---

# Using External IDs

By default, Medplum uses email address as a unique identifier for a user. When using External Identity Providers, you may instead want to use the external ID rather than email. This document describes the additional changes to use external ID.

## Configure client

Navigate to "Project Admin" and then "Clients".

Find your Client Application.

Set `ClientApplication.identityProvider.useSubject` to `true`. When this flag is enabled:

- Medplum will use the external IdP `sub` (subject) claim as the primary identifier.
- The subject value is matched against `ProjectMembership.externalId` for the project associated with the login.
- Email is no longer required on the external token, but can still be present and used for profiles.

## Invite user

To associate an external subject with a Medplum user and project membership, you must invite the user to your project.

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

You can then use the external auth provider as described in [External Identity Providers](/docs/auth/external-identity-providers)

This will also work with the example repo:

> [https://github.com/medplum/medplum-client-external-idp-demo](https://github.com/medplum/medplum-client-external-idp-demo)
