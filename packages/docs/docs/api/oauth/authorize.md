---
sidebar_position: 1
---

# Authorize endpoint

The `/oauth2/authorize` endpoint signs in the user.

## GET `/oauth2/authorize`

The `/oauth2/authorize` endpoint only supports `HTTPS GET`. The client typically makes this request through a browser.

The authorization server requires HTTPS. For more information about the OpenID Connect specification, see [Authorization Endpoint](http://openid.net/specs/openid-connect-core-1_0.html#ImplicitAuthorizationEndpoint).

## Request parameters

#### `response_type` (Required)

The response type. Must be `code`.

#### `client_id` (Required)

The Client ID. Must be a client that you already registered. .

#### `redirect_uri` (Required)

The URL where the authentication server redirects the browser after Medplum authorizes the user.
A redirect uniform resource identifier (URI) must have the following attributes:

- It must be an absolute URI.
- You must have pre-registered the URI with a client.
- The `redirect_uri` parameter must **match exactly** to the pre-registered uri on the Medplum Server (including trailing slashes, punctuation, etc.), as detailed in the [OAuth2 Spec](https://www.rfc-editor.org/rfc/rfc6749#section-3.1.2.3)
- It can't include a fragment component.
  See [OAuth 2.0 - Redirection Endpoint](https://tools.ietf.org/html/rfc6749#section-3.1.2).
  Medplum requires that your redirect URI use HTTPS, except for `http://localhost`, which you can set as a callback URL for testing purposes.

#### `state` (Optional but recommended)

When your app adds a _state_ parameter to a request, Medplum returns its value to your app when the `/oauth2/authorize` endpoint redirects your user.
Add this value to your requests to guard against [CSRF](https://en.wikipedia.org/wiki/Cross-site_request_forgery) attacks.
You can't set the value of a `state` parameter to a URL-encoded JSON string. To pass a string that matches this format in a `state` parameter, encode the string to Base64, then decode it in your app.

#### `scope` (Required)

Can be a combination of any system-reserved scopes or custom scopes that are associated with a client. Scopes must be separated by spaces. System reserved scopes are `openid`, `email`, `phone`, and `profile`.
If the client doesn't request any scopes, the authentication server uses `openid` by default.

#### `code_challenge_method` (Optional)

The method that you used to generate the challenge. The [PKCE RFC](https://tools.ietf.org/html/rfc7636) defines two methods, S256 and plain.

#### `code_challenge` (Conditional)

The challenge that you generated from the `code_verifier`.
Required only when you specify a `code_challenge_method` parameter.

#### `nonce`

A random value that you can add to the request. The nonce value that you provide is included in the ID token that Medplum issues. You can use a `nonce` value to guard against replay attacks.

## Examples requests with positive responses

### Authorization code grant

#### Sample Request

```
GET https://api.medplum.com/oauth2/authorize?
    response_type=code&
    client_id=492e4ec3-fb66-4b45-b529-599c708ec530&
    redirect_uri=https://YOUR_APP/redirect_uri&
    state=STATE&
    scope=openid
```

#### Sample response

The Medplum authentication server redirects back to your app with the authorization code and state. The code and state must be returned in the query string parameters and not in the fragment. A query string is the part of a web request that appears after a '?' character; the string can contain one or more parameters separated by '&' characters. A fragment is the part of a web request that appears after a '#' character to specify a subsection of a document.

**Note**
The response returns a one time use code that is valid for five minutes.

```
HTTP/1.1 302 Found
Location: https://YOUR_APP/redirect_uri?code=AUTHORIZATION_CODE&state=STATE
```

### Authorization code grant with PKCE

#### Sample Request

```
GET https://api.medplum.com/oauth2/authorize?
    response_type=code&
    client_id=492e4ec3-fb66-4b45-b529-599c708ec530&
    redirect_uri=https://YOUR_APP/redirect_uri&
    state=STATE&
    scope=openid&
    code_challenge_method=S256&
    code_challenge=CODE_CHALLENGE
```

#### Sample Response

The authentication server redirects back to your app with the authorization code and state. The code and state must be returned in the query string parameters and not in the fragment.

```
HTTP/1.1 302 Found
Location: https://YOUR_APP/redirect_uri?code=AUTHORIZATION_CODE&state=STATE
```

### Token grant without `openid` scope

#### Sample Request

```
GET https://api.medplum.com/oauth2/authorize?
    response_type=token&
    client_id=492e4ec3-fb66-4b45-b529-599c708ec530&
    redirect_uri=https://YOUR_APP/redirect_uri&
    state=STATE&
    scope=profile
```

#### Sample Response

The Medplum authorization server redirects back to your app with access token. Because `openid` scope was not requested, Medplum doesn't return an ID token. Also, Medplum doesn't return a refresh token in this flow. Medplum returns the access token and state in the fragment and not in the query string.

```
HTTP/1.1 302 Found
Location: https://YOUR_APP/redirect_uri#access_token=ACCESS_TOKEN&token_type=bearer&expires_in=3600&state=STATE
```

### Token grant with `openid` scope

#### Sample Request

```
GET https://api.medplum.com/oauth2/authorize?
    response_type=token&
    client_id=492e4ec3-fb66-4b45-b529-599c708ec530&
    redirect_uri=https://YOUR_APP/redirect_uri&
    state=STATE&
    scope=openid
```

#### Sample Response

The authorization server redirects back to your app with access token and ID token (because `openid` scope was included).

```
HTTP/1.1 302 Found
Location: https://YOUR_APP/redirect_uri#id_token=ID_TOKEN&access_token=ACCESS_TOKEN&token_type=bearer&expires_in=3600&state=STATE
```

## Examples of negative responses

The following are examples of negative responses:

##### `invalid_request`

If `client_id` and `redirect_uri` are valid, but the request parameters aren't formatted correctly, the authentication server redirects the error to client's `redirect_uri` and appends an error message in a URL parameter. Examples of incorrect formatting are a request doesn't include a `response_type` parameter, if the response provides `code_challenge` but not `code_challenge_method`, or that `code_challenge_method` is not 'S256'.

```
HTTP 1.1 302
Found Location: https://client_redirect_uri?error=invalid_request
```

##### `unauthorized_client`

If the client requests `code` or `token` in `response_type` but doesn't have permission for these requests, the Medplum authorization server returns `unauthorized_client` to client's `redirect_uri`, as follows:

```
HTTP 1.1 302
Found Location: https://client_redirect_uri?error=unauthorized_client
```

##### `invalid_scope`

If the client requests scope that is unknown, malformed, or not valid, the Medplum authorization server returns `invalid_scope` to the client's `redirect_uri`, as follows:

```
HTTP 1.1 302
Found Location: https://client_redirect_uri?error=invalid_scope
```

#####

If there is any unexpected error in the server, the authentication server returns `server_error` to client's `redirect_uri`. Because the HTTP 500 error doesn't get sent to the client, don't display the error to the user in the browser. The following error should result:

```
HTTP 1.1 302
Found Location: https://client_redirect_uri?error=server_error
```

##### timeout

When Medplum authenticates through federation to third-party IdPs, Medplum might experience connection issues such as the following:

- If a connection timeout occurs while requesting token from the IdP, the authentication server redirects the error to the client’s `redirect_uri` as follows:

  ```
  HTTP 1.1 302
  Found Location: https://client_redirect_uri?error=invalid_request&
                  error_description=Timeout+occurred+in+calling+IdP+token+endpoint
  ```

- If a connection timeout occurs while calling the `jwks` endpoint for `id_token` validation, the authentication server redirects the error to the client’s `redirect_uri` as follows:

  ```
  HTTP 1.1 302
  Found Location: https://client_redirect_uri?error=invalid_request&
                  error_description=error_description=Timeout+in+calling+jwks+uri
  ```

##### configuration error

- When authenticating by federating to third-party IdPs, the providers may return error responses due to configuration errors or otherwise such as the following:

  - If an error response is received from other providers, the authentication server redirects the error to the client’s `redirect_uri` as follows:

    ```
    HTTP 1.1 302
    Found Location: https://client_redirect_uri?error=invalid_request&
                    error_description=[IdP name]+Error+-+[status code]+error getting token
    ```

  - If an error response is received from Google, the authentication server redirects the error to the client’s `redirect_uri` as follows:

  ```
  HTTP 1.1 302
  Found Location: https://client_redirect_uri?error=invalid_request&
                  error_description=Google+Error+-+[status code]+[Google provided error code]
  ```

##### connection error

- When Medplum encounters an exception in the communication protocol while it makes a connection to an external IdP, the authentication server redirects the error to the client's `redirect_uri` with either of the following messages:
  ```
  HTTP 1.1 302
  Found Location: https://client_redirect_uri?error=invalid_request&
                  error_description=Connection+reset
  ```
  ```
  HTTP 1.1 302
  Found Location: https://client_redirect_uri?error=invalid_request&
                  error_description=Read+timed+out
  ```
