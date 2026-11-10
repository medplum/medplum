---
id: external-ids
title: Using External IDs
weight: 90
docs_tags: [auth]
---

By default, Medplum uses email address as a unique identifier for a user. When using External Identity Providers, you may instead want to use the external ID rather than email. This document describes the additional changes to use external ID.

## Configure client

Navigate to "Project Admin" and then "Clients".

Find your Client Application.

Set `ClientApplication.identityProvider.useSubject` to `true`.

The external IDP callback also supports explicit `identitySource` and `identityMappingMode` settings. If supplied, keep them set to `subject` and `project-membership-external-id` for subject matching. Token exchange selects its matching mode using `useSubject`.

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

{{< tip >}}

Use the complete `sub` value returned by your provider, including any prefix. For example, provision an Auth0 subject of `google-oauth2|110925489055200000000` with that exact external ID. With the subject-matching configuration above, both the external IDP callback and token exchange use the complete subject.

{{< /tip >}}

Then POST to the `/invite` endpoint:

```bash
curl 'https://api.medplum.com/admin/projects/MY_PROJECT_ID/invite' \
  -H 'Authorization: Bearer MY_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  --data-raw '{"resourceType":"Patient","firstName":"Homer","lastName":"Simpson","externalId":"google-oauth2|110925489055200000000"}'
```

## Updating existing external IDs

Earlier documentation advised stripping the Auth0 provider prefix. If you followed that guidance, verify the complete `sub` returned by your provider and have a project administrator update the existing `ProjectMembership.externalId` to match it. Preserve the membership's user and profile links, then test sign-in.

The project-admin endpoint supports reading and updating a membership at `/admin/projects/{projectId}/members/{membershipId}`. Use `GET` to read the current membership, change its `externalId`, and `POST` the complete updated resource to the same URL.

## Login example

You can then use the external auth provider as described in [External Identity Providers](/docs/auth/external-identity-providers)

This will also work with the example repo:

> [https://github.com/medplum/medplum-client-external-idp-demo](https://github.com/medplum/medplum-client-external-idp-demo)
