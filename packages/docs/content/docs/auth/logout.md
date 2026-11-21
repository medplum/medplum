---
id: logout
title: Logout
weight: 100
docs_tags: [auth]
---

Medplum supports revoking the current session or another session belonging to the user. Revocation invalidates the access and refresh tokens associated with that session.

1. Revoke the current session using `/oauth2/logout`.
2. Revoke another session by login ID using `/auth/revoke`.

## Revoke the current session {#revoke-current-access-token}

Send an authenticated request to `/oauth2/logout` to revoke the current session.

Send an HTTP POST request

```bash
curl 'https://api.medplum.com/oauth2/logout' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{}'
```

Or use `MedplumClient`:

```ts
await medplum.signOut();
```

## Revoke another session {#revoke-other-session-access-token}

Users can retrieve a list of active sessions using the `/auth/me` endpoint. It will include basic session details such as User Agent and Remote Host (IP Address).

Each session has a login `id`. Use this ID to revoke that session and its associated tokens. Listing and revoking other sessions requires an authenticated human user without SMART resource scopes or On-Behalf-Of delegation.

Users who signed in with a password or Google can list and revoke their sessions in all of their projects. Other logins can only list and revoke sessions in the current project.

```bash
curl 'https://api.medplum.com/auth/revoke' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{"loginId":"MY_LOGIN_ID"}'
```

Or use `MedplumClient`:

```ts
await medplum.post('/auth/revoke', { loginId: 'MY_LOGIN_ID' });
```
