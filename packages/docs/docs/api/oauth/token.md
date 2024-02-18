---
sidebar_position: 2
---

# Token endpoint

The `/oauth2/token` endpoint gets the user's tokens.

## POST `/oauth2/token`

The `/oauth2/token` endpoint only supports `HTTPS POST`. Your app makes requests to this endpoint directly, not through the user's browser.

For more information about the token endpoint from the OpenID Connect specification, see [Token Endpoint](http://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint).

## Request parameters in header

#### `Authorization`

If the client was issued a secret, the client must pass its `client_id` and `client_secret` in the authorization header through Basic HTTP authorization. The authorization header string is [Basic](https://en.wikipedia.org/wiki/Basic_access_authentication#Client_side) `Base64Encode(client_id:client_secret)`. The following example is an authorization header for app client `492e4ec3-fb66-4b45-b529-599c708ec530&` with client secret `abcdef01234567890`, using the Base64-encoded version of the string `492e4ec3-fb66-4b45-b529-599c708ec530&:abcdef01234567890`.

```
Authorization: Basic ZGpjOTh1M2ppZWRtaTI4M2V1OTI4OmFiY2RlZjAxMjM0NTY3ODkw
```

#### `Content-Type`

Must always be `'application/x-www-form-urlencoded'`.

## Request parameters in body

#### `grant_type` (Required)

Grant type.
Must be `authorization_code` or `refresh_token` or `client_credentials`. You can request an access token for a custom scope from the token endpoint when, in the app client, the requested scope is enabled, you have configured a client secret, and you have allowed `client_credentials` grants.

#### `client_id` (Required)

The Client ID. Must be a client that you already registered.

#### `scope` (Optional)

Can be a combination of any custom scopes associated with an app client. Any scope that you request must be activated for the app client, or Medplum will ignore it. If the client doesn't request any scopes, the authentication server uses all custom scopes associated with the client.
Only used if the `grant_type` is `client_credentials`.

#### `redirect_uri` (Conditional)

Must be the same `redirect_uri` that was used to get `authorization_code` in `/oauth2/authorize`.
Required only if `grant_type` is `authorization_code`.

#### `refresh_token` (Optional)

The refresh token.
The token endpoint returns `refresh_token` only when the `grant_type` is `authorization_code`.

#### `code` (Conditional)

Required if `grant_type` is `authorization_code`.

#### `code_verifier` (Conditional)

The proof key.
Required if `grant_type` is `authorization_code` and the authorization code was requested with PKCE.

## Examples requests with positive responses

### Exchanging an authorization code for tokens

#### Sample Request

```
POST https://api.medplum.com/oauth2/token&
    Content-Type='application/x-www-form-urlencoded'&
    Authorization=Basic aSdxd892iujendek328uedj

grant_type=authorization_code&
client_id=492e4ec3-fb66-4b45-b529-599c708ec530&&
code=AUTHORIZATION_CODE&
redirect_uri=https://myclient/redirect
```

#### Sample Response

```
HTTP/1.1 200 OK

Content-Type: application/json

{
    "access_token":"eyJz9sdfsdfsdfsd",
    "id_token":"dmcxd329ujdmkemkd349r",
    "token_type":"Bearer",
    "expires_in":3600
}
```

**Note**
The token endpoint returns `refresh_token` only when the `grant_type` is `authorization_code` and the requested scopes during login included `offline` or `offline_access`.

### Exchanging client credentials for an access token

#### Sample Request

```
POST https://api.medplum.com/oauth2/token
    Content-Type='application/x-www-form-urlencoded'&
    Authorization=Basic aSdxd892iujendek328uedj

grant_type=client_credentials&
scope=openid
```

#### Sample Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "access_token":"eyJz9sdfsdfsdfsd",
    "token_type":"Bearer",
    "expires_in":3600
}
```

### Exchanging an authorization code grant with PKCE for tokens

#### Sample Request

```
POST https://api.medplum.com/oauth2/token
    Content-Type='application/x-www-form-urlencoded'&
    Authorization=Basic aSdxd892iujendek328uedj

grant_type=authorization_code&
client_id=492e4ec3-fb66-4b45-b529-599c708ec530&&
code=AUTHORIZATION_CODE&
code_verifier=CODE_VERIFIER&
redirect_uri=https://myclient/redirect
```

#### Sample Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "access_token":"eyJz9sdfsdfsdfsd",
    "refresh_token":"dn43ud8uj32nk2je",
    "id_token":"dmcxd329ujdmkemkd349r",
    "token_type":"Bearer",
    "expires_in":3600
}
```

**Note**
The token endpoint returns `refresh_token` only when the `grant_type` is `authorization_code`.

### Exchanging a refresh token for tokens

#### Sample Request

```
POST https://api.medplum.com/oauth2/token >
    Content-Type='application/x-www-form-urlencoded'&
    Authorization=Basic aSdxd892iujendek328uedj

grant_type=refresh_token&
client_id=492e4ec3-fb66-4b45-b529-599c708ec530&&
refresh_token=REFRESH_TOKEN
```

#### Sample Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "id_token":"eyJz9sdfsdfsdfsd",
    "access_token":"dmcxd329ujdmkemkd349r",
    "token_type":"Bearer",
    "expires_in":3600
}
```

:::info Note

The token endpoint returns `refresh_token` only when the `grant_type` is `authorization_code`.

:::

## Examples of negative responses

#### Sample Error Response

```
HTTP/1.1 400 Bad Request
Content-Type: application/json;charset=UTF-8

{
    "error":"invalid_request|invalid_client|invalid_grant|unauthorized_client|unsupported_grant_type|"
}
```

##### `invalid_request`

The request is missing a required parameter, includes an unsupported parameter value (other than `unsupported_grant_type`), or is otherwise malformed. For example, `grant_type` is `refresh_token` but `refresh_token` is not included.

##### `invalid_client`

Client authentication failed. For example, when the client includes `client_id` and `client_secret` in the authorization header, but there's no such client with that `client_id` and `client_secret`.

##### `invalid_grant`

Refresh token has been revoked.
Authorization code has been consumed already or does not exist.
App client doesn't have read access to all [attributes](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html) in the requested scope. For example, your app requests the `email` scope and your app client can read the `email` attribute, but not `email_verified`.

##### `unauthorized_client`

Client is not allowed for code grant flow or for refreshing tokens.

##### `unsupported_grant_type`

Returned if `grant_type` is anything other than `authorization_code` or `refresh_token` or `client_credentials`.
