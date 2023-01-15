---
sidebar_position: 3
---

# UserInfo endpoint

The `/oauth2/userinfo` endpoint returns information about the authenticated user.

## GET `/oauth2/userinfo`

The user pool client makes requests to this endpoint directly and not through a browser.

For more information, see [UserInfo Endpoint](http://openid.net/specs/openid-connect-core-1_0.html#UserInfo) in the OpenID Connect (OIDC) specification.

## Request parameters in header

#### `Authorization` (Required)

Pass the access token using the authorization header field.

```
Authorization: Bearer <ACCESS_TOKEN>
```

## Examples positive responses

#### Sample request

```
GET https://api.medplum.com/oauth2/userinfo
    Authorization: Bearer <access_token>
```

#### Sample response

```
HTTP/1.1 200 OK
Content-Type: application/json;charset=UTF-8

{
    "sub": "248289761001",
    "name": "Jane Doe",
    "given_name": "Jane",
    "family_name": "Doe",
    "preferred_username": "j.doe",
    "email": "janedoe@example.com"
}
```

For a list of OIDC claims, see [Standard Claims](http://openid.net/specs/openid-connect-core-1_0.html#StandardClaims).

## Sample negative responses

#### Invalid request

```
HTTP/1.1 400 Bad Request
    WWW-Authenticate: error="invalid_request",
    error_description="Bad OAuth2 request at UserInfo Endpoint"
```

##### `invalid_request`

The request is missing a required parameter, includes an unsupported parameter value, or is otherwise malformed.

#### Invalid token

```
HTTP/1.1 401 Unauthorized
    WWW-Authenticate: error="invalid_token",
    error_description="Access token is expired, disabled, or deleted, or the user has globally signed out."
```

##### `invalid_token`

The access token is expired, revoked, malformed, or invalid.
