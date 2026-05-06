# Ubix Data Medplum Handoff

Last updated: 2026-05-06

## Purpose

This document explains how Ubix should connect to the Hiive Medplum build environment using the dedicated `ubix-data` service account.

This is a machine-to-machine integration account implemented as a Medplum `ClientApplication`.
It is not a human login and should not be used to sign into the Medplum web app.

## Environment Summary

| Item | Value |
| --- | --- |
| Environment | `build` |
| Base domain | `ehr.hiivehealth.net` |
| Medplum app | `https://app.ehr.hiivehealth.net/` |
| Medplum API base | `https://api.ehr.hiivehealth.net/` |
| FHIR R4 base | `https://api.ehr.hiivehealth.net/fhir/R4/` |
| OAuth token endpoint | `https://api.ehr.hiivehealth.net/oauth2/token` |

## What Was Created For Ubix

To avoid giving Ubix super-admin access, a dedicated Medplum project was created first, and the service account was created inside that project.

| Item | Value |
| --- | --- |
| Project name | `Ubix Data` |
| Project ID | `7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8` |
| Client name | `ubix-data` |
| Client ID | `69a636e6-b110-4de7-ac73-4c2b642b48a2` |
| Client scope model | Project-scoped |
| Verified project at login | `Project/7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8` |

## Credential Handling

The `ubix-data` client secret is a live credential.
It should be shared with Ubix through a secure channel such as a password manager, encrypted secret vault, or direct secure handoff.

Do not rely on this repository as the source of truth for the secret.

Hiive will provide the secret separately from this document.
Hiive should store the source-of-truth value in an approved secret manager such as AWS Secrets Manager, 1Password, or another managed secrets vault rather than in Git.
For local operator convenience, a gitignored workspace file can be used temporarily, but the secret manager should remain the primary record.

When handing off to Ubix, provide:

- Client ID: `69a636e6-b110-4de7-ac73-4c2b642b48a2`
- Client secret: provide separately through a secure channel
- Token endpoint: `https://api.ehr.hiivehealth.net/oauth2/token`
- FHIR API base: `https://api.ehr.hiivehealth.net/fhir/R4/`

## How Ubix Authenticates

Ubix should use the OAuth2 `client_credentials` flow.

### 1. Request an access token

```bash
curl -X POST https://api.ehr.hiivehealth.net/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=69a636e6-b110-4de7-ac73-4c2b642b48a2&client_secret=<UBIX_DATA_CLIENT_SECRET>"
```

Expected response shape:

```json
{
  "token_type": "Bearer",
  "access_token": "...",
  "expires_in": 3600
}
```

### 2. Use the bearer token against the FHIR API

```bash
curl https://api.ehr.hiivehealth.net/fhir/R4/Patient \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/fhir+json"
```

### 3. Optional health check

```bash
curl https://api.ehr.hiivehealth.net/healthcheck
```

## Example In Node.js

```js
const tokenResponse = await fetch('https://api.ehr.hiivehealth.net/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: '69a636e6-b110-4de7-ac73-4c2b642b48a2',
    client_secret: process.env.UBIX_DATA_CLIENT_SECRET,
  }),
});

const tokenBody = await tokenResponse.json();
const accessToken = tokenBody.access_token;

const patientResponse = await fetch('https://api.ehr.hiivehealth.net/fhir/R4/Patient', {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/fhir+json',
  },
});

const patients = await patientResponse.json();
console.log(patients);
```

## Important Notes For Ubix

- This client is for API access only.
- This client is scoped to the dedicated `Ubix Data` project, not the Medplum `Super Admin` project.
- No human Ubix user was created as part of this step.
- If Ubix needs interactive access to the Medplum web app, create a separate invited human user instead of sharing the service account.
- If tighter permissions are needed later, add a Medplum `AccessPolicy` to the `ubix-data` client membership.

## Operational Notes For Hiive

- The service account was successfully verified with a client-credentials login after creation.
- If the secret is lost or needs to be replaced, rotate or recreate the client before re-sharing access with Ubix.
- If Ubix needs a different permission model, update the `ClientApplication` membership in the `Ubix Data` project rather than moving them into `Super Admin`.

## Related Docs

- `hiive-build-deployment.md`
- `hiive-build-deployment-non-technical.md`
- `ubix-data-admin-secret-retrieval.md`