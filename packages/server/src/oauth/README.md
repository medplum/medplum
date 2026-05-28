# OpenID Certification

Overview: https://openid.net/certification/

OpenID Implementer's Guide: https://openid.net/specs/openid-connect-basic-1_0.html

## Setup the Practitioner

For both local and production testing, setup your Practitioner profile with all of the OpenID user info properties:

| User info property    | Practitioner property       | Example value |
| --------------------- | --------------------------- | ------------- |
| name                  | name[0]                     | Alice         |
| given_name            | name[0].given[0]            |               |
| middle_name           | name[0].given[0]            |               |
| family_name           | name[0].family              |               |
| gender                | name[0].gender              |               |
| picture               | photo[0].url                |               |
| preferred_username    | telecom                     |               |
| nickname              | name.where(use='nickname')  |               |
| website               | telecom.where(system='url') |               |
| zoneinfo              | extension                   |               |
| email                 | telecom                     |               |
| email_verified        |                             |               |
| phone_number          | telecom                     |               |
| phone_number_verified |                             |               |
| address               | address                     |               |

For example:

```json
{
  "resourceType": "Practitioner",
  "extension": [
    {
      "url": "http://hl7.org/fhir/StructureDefinition/timezone",
      "valueCode": "US/Pacific"
    }
  ],
  "birthDate": "1970-01-01",
  "gender": "male",
  "name": [
    {
      "use": "official",
      "given": ["Homer", "J"],
      "family": "Simpson"
    },
    {
      "use": "nickname",
      "given": ["Homer"]
    }
  ],
  "telecom": [
    {
      "system": "email",
      "use": "work",
      "value": "homer.simpson@example.com"
    },
    {
      "system": "url",
      "use": "work",
      "value": "https://www.example.com/"
    }
  ],
  "address": [
    {
      "line": ["742 Evergreen Terrace"],
      "city": "Springfield",
      "state": "IL",
      "postalCode": "12345"
    }
  ],
  "photo": [
    {
      "contentType": "image/webp",
      "url": "Binary/123",
      "title": "homer-simpson.webp"
    }
  ]
}
```

## Test against OpenID Conformance Suite locally

Follow these instructions to setup your local dev environment with the Conformance Suite.

Requirements:

- The Conformance Suite running in Docker must be able to access the Medplum API server
- The Medplum API server cookies require HTTPS
- That means that the Medplum API server cannot simply use "localhost"
- Instead, we will use ngrok to create a public URL that tunnels to our local dev environment, and configure the Medplum API server to use that URL as its base URL

The Medplum OpenID configuration requires HTTPS. We recommend using ngrok for this purpose. We recommend using multiple tunnels: one for the API server and one for the app server. This allows the Conformance Suite to access the API server directly, without going through the app server.

For the purposes of this example, we will use the following ngrok URLs:

- API server: https://api.ngrok.medplum.dev
- App server: https://app.ngrok.medplum.dev

### Update the app config

Open `packages/app/.env`

Add or replace the `MEDPLUM_BASE_URL` environment variable with `https://api.ngrok.medplum.dev/`

```
MEDPLUM_BASE_URL=https://api.ngrok.medplum.dev/
```

### Update the server config

Open `packages/server/medplum.config.json`

Replace all instances of `http://localhost:8103/` with `https://api.ngrok.medplum.dev/`

Replace all instances of `http://localhost:3000/` with `https://app.ngrok.medplum.dev/`

### Setup ngrok

For example:

```yaml
# ~/.config/ngrok/ngrok.yml
version: 3

agent:
  authtoken: YOUR_NGROK_AUTH_TOKEN

endpoints:
  - name: app
    url: https://app.ngrok.medplum.dev
    upstream:
      url: http://localhost:3000

  - name: api
    url: https://api.ngrok.medplum.dev
    upstream:
      url: http://localhost:8103
```

Then run `ngrok start --all` to start the tunnels.

### Setup the OpenID project

Register a new Medplum project called "OpenID Certification"

Create two new clients called "OpenID Client 1" and "OpenID Client 2"

Update both clients "Redirect URI" to "https://localhost.emobix.co.uk:8443/test/a/medplum/callback"

Make note of the client IDs and client secrets

### Install the Conformance Suite

https://gitlab.com/openid/conformance-suite/-/wikis/Developers/Build-&-Run

Download docker-compose-prebuilt.yml into an empty directory:

```bash
curl -O https://gitlab.com/openid/conformance-suite/-/raw/master/docker-compose-prebuilt.yml
```

Start the stack:

```bash
docker compose -f docker-compose-prebuilt.yml up
```

Open browser to <https://localhost.emobix.co.uk:8443/>

Test the Docker localhost URL: <http://host.docker.internal:8103/>

Be sure to logout between each test by visiting <https://api.ngrok.medplum.dev/oauth2/logout>

### OpenID notes

Create two clients

Set the "Redirect URI" to "https://localhost.emobix.co.uk:8443/test/a/medplum/callback"

- Test Plan: OpenID Connect Core: Basic Certification Profile Authorization server test
- Server metadata location: discovery
- Client Registration Type: static_client
- Test Information
  - alias: medplum
  - description: medplum
  - publish: No
- Server
  - discoveryUrl: https://api.ngrok.medplum.dev/.well-known/openid-configuration
  - login_hint:
- Client:
  - client_id: CLIENT_ID_1
  - client_secret: CLIENT_SECRET_1
- Client for client_secret_post:
  - client_id: CLIENT_ID_1
  - client_secret: CLIENT_SECRET_1
- Second client:
  - client_id: CLIENT_ID_2
  - client_secret: CLIENT_SECRET_2

## SMART-on-FHIR Certification

https://smarthealthit.org/

### Test against Inferno locally

Git repo: https://github.com/onc-healthit/inferno

```bash
git clone git@github.com:onc-healthit/inferno.git
cd inferno
docker-compose up
```

Open browser to <http://localhost:4567/>

Test the Docker localhost URL: <http://host.docker.internal:8103/>

Be sure to logout between each test by visiting <http://host.docker.internal:8103/oauth2/logout>

### Inferno notes

In "EHR Launch Sequence":

Make sure "Scopes" includes:

```
fhirUser launch launch/patient offline_access openid profile user/*.* patient/*.*
```

Launch URL's:

- Redirect URI: http://localhost:4567/inferno/oauth2/static/redirect
- Launch URI: http://localhost:4567/inferno/oauth2/static/launch
- Launch URI: http://localhost:4567/inferno/oauth2/static/launch

Launch parameters:

- "iss" - Issuer, must be full FHIR base URL
- "state" - Must be unique random state

http://localhost:4567/inferno/oauth2/static/launch?iss=http%3A%2F%2Fhost.docker.internal%3A8103%2Ffhir%2FR4&launch=xyz1234

Launch URI: https://inferno.healthit.gov/suites/custom/smart/launch
Redirect URI: https://inferno.healthit.gov/suites/custom/smart/redirect

https://inferno.healthit.gov/suites/custom/smart/launch?iss=https%3A%2F%2Fngrok.medplum.dev%2Ffhir%2FR4&launch=xyz1234
