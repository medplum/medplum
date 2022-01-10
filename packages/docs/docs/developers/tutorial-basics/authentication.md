---
sidebar_position: 1
---

# Authenticating to the service

The Medplum API uses standard OAuth2/OpenID authentication. "Client Credentials Flow" is recommended for machine-to-machine access.

## Obtaining Credentials

This tutorial assumes you already have a Medplum account in good standing. (If not, please [register](https://app.medplum.com/register).)

You will need to create a [ClientApplication](https://app.medplum.com/ClientApplication) if one does not already exist. You can create a new ClientApp [here](https://app.medplum.com/ClientApplication/new).

For this example you will need to provide an `ID` and `Secret`, but Redirect Uri is optional.

## Connecting to the service

Execute a HTTP POST request to the OAuth2 Token endpoint:

```curl
curl -X POST https://api.medplum.com/oauth2/token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$MY_CLIENT_ID&client_secret=$MY_CLIENT_SECRET"
```

On success, the response will be a JSON object with the following properties:

```json
{
  "token_type": "Bearer",
  "access_token": "...",
  "expires_in": 3600
}
```

The value of "access_token" can then be used in future requests for authentication.

For more details about OAuth2 Client Credentials Flow:

- https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
- https://oauth.net/2/grant-types/client-credentials/
- https://auth0.com/docs/flows/client-credentials-flow
