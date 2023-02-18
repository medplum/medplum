# OpenID Certification

Overview: https://openid.net/certification/

OpenID Implementer's Guide: https://openid.net/specs/openid-connect-basic-1_0.html

## Setup the Practitioner

For both local and production testing, setup your Practitioner profile with all of the OpenID user info properties:

| User info property    | Practitioner property | Example value |
| --------------------- | --------------------- | ------------- |
| name                  | name[0]               | Alice         |
| given_name            | name[0].given[0]      |               |
| middle_name           | name[0].given[0]      |               |
| family_name           | name[0].family        |               |
| gender                | name[0].gender        |               |
| picture               | photo[0].url          |               |
| preferred_username    |                       |               |
| nickname              |                       |               |
| website               |                       |               |
| zoneinfo              |                       |               |
| email                 | telecom               |               |
| email_verified        |                       |               |
| phone_number          | telecom               |               |
| phone_number_verified |                       |               |
| address               | address               |               |

## Test against OpenID Conformance Suite locally

Follow these instructions to setup your local dev environment with the Conformance Suite.

Requirements:

- The Conformance Suite running in Docker must be able to access the Medplum API server
  - That means that the Medplum API server cannot simply use "localhost"
  - Instead, we will use `host.docker.internal`
- The Medplum API server cookies require HTTPS
  - That means we cannot simply use webpack-dev-server and ts-node-dev
  - Instead, we will use [Caddy](https://caddyserver.com/) for an easy localhost HTTPS proxy

The Medplum OpenID configuration requires HTTPS. We recommend using .

| Service | HTTP address                     | HTTPS address                     |
| ------- | -------------------------------- | --------------------------------- |
| api     | http://host.docker.internal/8103 | https://host.docker.internal/8104 |
| app     | http://localhost:3000            | https://localhost:8106            |

### Update the app config

Open `packages/app/.env`

Add or replace the `MEDPLUM_BASE_URL` environment variable with `https://host.docker.internal:8104/`

```
MEDPLUM_BASE_URL=https://host.docker.internal:8104/
```

### Update the server config

Open `packages/server/medplum.config.json`

Replace all instances of `http://localhost:8103/` with `https://host.docker.internal:8104/`

Replace all instances of `http://localhost:3000/` with `https://localhost:8106/`

The result should look something like this:

```json
{
  "port": 8103,
  "baseUrl": "https://host.docker.internal:8104/",
  "issuer": "https://host.docker.internal:8104/",
  "audience": "https://host.docker.internal:8104/",
  "jwksUrl": "https://host.docker.internal:8104/.well-known/jwks.json",
  "authorizeUrl": "https://host.docker.internal:8104/oauth2/authorize",
  "tokenUrl": "https://host.docker.internal:8104/oauth2/token",
  "userInfoUrl": "https://host.docker.internal:8104/oauth2/userinfo",
  "appBaseUrl": "https://localhost:8106",
  "binaryStorage": "file:./binary/",
  "storageBaseUrl": "https://host.docker.internal:8104/storage/",
  "database": {
    "host": "localhost",
    "port": 5432,
    "dbname": "medplum",
    "username": "medplum",
    "password": "medplum"
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "medplum"
  }
}
```

### Setup Caddy

First, download and install Caddy: https://caddyserver.com/download

Next, create a `Caddyfile` with the following contents:

```
localhost:8104 {
  reverse_proxy 127.0.0.1:8103
  tls internal
}

localhost:8106 {
  reverse_proxy 127.0.0.1:8105
  tls internal
}
```

Now you can run Caddy with `caddy run`

Test the Medplum API server URL: <https://host.docker.internal:8104/>

Test the Medplum app URL: <https://localhost:8106/>

### Setup the OpenID project

Register a new Medplum project called "OpenID Certification"

Create two new clients called "OpenID Client 1" and "OpenID Client 2"

Update both clients "Redirect URI" to "https://localhost.emobix.co.uk:8443/test/a/medplum/callback"

Make note of the client IDs and client secrets

### Install the Conformance Suite

https://gitlab.com/openid/conformance-suite/-/wikis/Developers/Build-&-Run

```bash
git clone git@gitlab.com:openid/conformance-suite.git
cd conformance-suite
mvn clean package
docker-compose up
```

Open browser to <https://localhost.emobix.co.uk:8443/>

Test the Docker localhost URL: <http://host.docker.internal:8103/>

Be sure to logout between each test by visiting <http://host.docker.internal:8103/oauth2/logout>

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
  - discoveryUrl: http://host.docker.internal:8103/.well-known/openid-configuration
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

Make sure "Scopes" includes "fhirUser launch launch/patient offline*access openid profile user/*._ patient/_.\_"

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

https://inferno.healthit.gov/suites/custom/smart/launch?iss=https%3A%2F%2Fcody.medplum.dev%2Ffhir%2FR4&launch=xyz1234
