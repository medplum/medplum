# Ubix Data Admin Secret Retrieval

Last updated: 2026-05-06

## Purpose

This document explains the admin-side flow for retrieving the existing `ubix-data` Medplum client secret so it can be stored internally and handed off to Ubix through a secure channel.

This is an internal Hiive operations procedure.
It is not intended for Ubix.

## When To Use This

Use this procedure when you need to:

- confirm the current `ubix-data` client secret
- copy the current secret into your secret manager
- re-send the credential to Ubix through an approved secure channel

## Target Client

| Item | Value |
| --- | --- |
| Project name | `Ubix Data` |
| Project ID | `7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8` |
| Client name | `ubix-data` |
| Client ID | `69a636e6-b110-4de7-ac73-4c2b642b48a2` |
| Resource URL | `https://api.ehr.hiivehealth.net/fhir/R4/ClientApplication/69a636e6-b110-4de7-ac73-4c2b642b48a2` |

## Summary Flow

1. Authenticate as a Medplum admin.
2. Read the `ClientApplication` resource for `ubix-data`.
3. Copy the `secret` field.
4. Store it in your secret manager.
5. Share it with Ubix through a secure channel.

## Step-By-Step Procedure

### 1. Authenticate as a Medplum admin

You need an admin account that can read the `ClientApplication` resource.

For this environment, the current admin API base is:

```text
https://api.ehr.hiivehealth.net/
```

### 2. Read the `ClientApplication` resource

The simplest repeatable method in this repo is a short Node script using the Medplum SDK.

Run this from the repository root:

```bash
cd /Users/chlong/github/medplum && node <<'NODE'
const { MedplumClient } = require('@medplum/core');

const store = new Map();
global.sessionStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

(async () => {
  const medplum = new MedplumClient({ baseUrl: 'https://api.ehr.hiivehealth.net/' });
  const loginParams = {
    email: 'admin@example.com',
    password: 'medplum_admin',
    scope: 'openid profile email',
    redirectUri: 'https://app.ehr.hiivehealth.net/',
  };

  const loginResult = await medplum.startLogin(loginParams);
  await medplum.processCode(loginResult.code, loginParams);

  const client = await medplum.readResource('ClientApplication', '69a636e6-b110-4de7-ac73-4c2b642b48a2');
  console.log(JSON.stringify({
    id: client.id,
    name: client.name,
    secret: client.secret,
    retiringSecret: client.retiringSecret,
  }, null, 2));
})();
NODE
```

Expected output shape:

```json
{
  "id": "69a636e6-b110-4de7-ac73-4c2b642b48a2",
  "name": "ubix-data",
  "secret": "..."
}
```

### 3. Copy the `secret` field

Copy only the value of `secret`.

Do not paste it into:

- Git-tracked files
- Slack channels
- ticket comments
- email threads

### 4. Store it in your secret manager

Store the value in an approved secret manager.

Recommended examples:

- AWS Secrets Manager
- 1Password shared engineering vault
- another approved company-managed secret store

If you need a temporary local working copy in this repo, use the gitignored file:

```text
.env.ubix-data.local
```

That file is for local operator convenience only and should not replace the secret manager as the source of truth.

### 5. Share it with Ubix through a secure channel

Provide Ubix with:

- client ID `69a636e6-b110-4de7-ac73-4c2b642b48a2`
- the current client secret
- token endpoint `https://api.ehr.hiivehealth.net/oauth2/token`

Use a secure channel such as:

- shared password manager item
- encrypted vault share
- another approved secure handoff mechanism

## Optional Direct API Method

If you already have an admin bearer token, you can read the resource directly:

```bash
curl https://api.ehr.hiivehealth.net/fhir/R4/ClientApplication/69a636e6-b110-4de7-ac73-4c2b642b48a2 \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/fhir+json"
```

Then copy the `secret` field from the response JSON.

## If The Secret Needs To Be Replaced

If the secret is lost, exposed, or should be rotated, use the Medplum `ClientApplication/$rotate-secret` operation as an admin.

That operation returns the updated `ClientApplication` resource with the new secret value.

## Related Docs

- `ubix-data-handoff.md`
- `hiive-build-deployment.md`