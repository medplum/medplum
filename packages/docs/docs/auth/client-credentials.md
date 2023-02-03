---
sidebar_position: 2
---

import BrowserOnlyTabs from '@site/src/components/BrowserOnlyTabs';
import TabItem from '@theme/TabItem';

# Client Credentials

The Medplum API uses standard OAuth2/OpenID authentication. The "Client Credentials Flow" is recommended for machine-to-machine access.

## Obtaining Credentials

This tutorial assumes you already have a Medplum account. (If not, please [register](https://app.medplum.com/register).)

Create a [ClientApplication](https://app.medplum.com/ClientApplication) if one does not already exist. You can create a new ClientApplication on the [Project Admin page](https://app.medplum.com/admin/project/client).

For this example you will need the `ID` and `Secret`.

## Connecting to the service

Execute a HTTP POST request to the OAuth2 Token endpoint:

<BrowserOnlyTabs groupId="language">
  <TabItem value="curl" label="cURL">

```curl
curl -X POST https://api.medplum.com/oauth2/token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$MY_CLIENT_ID&client_secret=$MY_CLIENT_SECRET"
```

  </TabItem>
  <TabItem value="python" label="Python">

```py
def get_auth_token(url, client_id, client_secret):

  # Encode the client ID and client secret
  authorization = base64.b64encode(bytes(client_id + ":" + client_secret, "ISO-8859-1")).decode("ascii")

  headers = {
      "Authorization": f"Basic {authorization}",
      "Content-Type": "application/x-www-form-urlencoded"
  }
  body = {
      "grant_type": "client_credentials"
  }

  response = requests.post(url, data=body, headers=headers)
  return response.json()['access_token']
```

  </TabItem>
</BrowserOnlyTabs>

On success, the response will be a JSON object with the following properties:

```json
{
  "token_type": "Bearer",
  "access_token": "<YOUR_AUTH_TOKEN>",
  "expires_in": 3600
}
```

The value of "access_token" can then be used in future requests for authentication.

For more details about OAuth2 Client Credentials Flow:

- https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
- https://oauth.net/2/grant-types/client-credentials/
- https://auth0.com/docs/flows/client-credentials-flow
