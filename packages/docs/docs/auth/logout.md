---
sidebar_position: 9
tags: [auth]
---

# Logout

There are two different methods to "logout" and revoke access tokens:

1. Revoke current access token using `/oauth2/logout`
2. Revoke other session access token using `/auth/revoke`

## Revoke current access token

Logout of the current session by revoking the current access token using `/oauth2/logout` endpoint.

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

## Revoke other session access token

Users can retrieve a list of active sessions using the `/auth/me` endpoint. It will include basic session details such as User Agent and Remote Host (IP Address).

Each session has a login `id`. You can use this login `id` to revoke a specific session access token.

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
