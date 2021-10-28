
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

Open browser to <https://localhost:8443/>

Test the Docker localhost URL:  <http://host.docker.internal:5000/>

Be sure to logout between each test by visiting <http://host.docker.internal:5000/oauth2/logout>

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

Test the Docker localhost URL:  <http://host.docker.internal:5000/>

Be sure to logout between each test by visiting <http://host.docker.internal:5000/oauth2/logout>

### Inferno notes

In "EHR Launch Sequence":

Make sure "Scopes" includes "fhirUser launch launch/patient offline_access openid profile user/*.* patient/*.*"

Launch URL's:

* Redirect URI: http://localhost:4567/inferno/oauth2/static/redirect
* Launch URI: http://localhost:4567/inferno/oauth2/static/launch
* Launch URI: http://localhost:4567/inferno/oauth2/static/launch

Launch parameters:

* "iss" - Issuer, must be full FHIR base URL
* "state" - Must be unique random state

http://localhost:4567/inferno/oauth2/static/launch?iss=http%3A%2F%2Fhost.docker.internal%3A5000%2Ffhir%2FR4&launch=xyz1234
