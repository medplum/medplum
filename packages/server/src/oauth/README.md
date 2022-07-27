## OpenID Certification

https://openid.net/certification/

### OpenID Implementer's Guide

https://openid.net/specs/openid-connect-basic-1_0.html

### Test against OpenID Conformance Suite locally

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

Set the "Redirect Uri" to "https://localhost.emobix.co.uk:8443/test/a/medplum/callback"

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
