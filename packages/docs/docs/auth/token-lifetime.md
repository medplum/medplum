---
sidebar_position: 8
tags: [auth]
---

# Token Lifetime

Medplum API access is granted primarily through [bearer tokens](https://oauth.net/2/bearer-tokens/) sent along with
every API request. These tokens are only considered valid for a period of time after they are issued, and will not
grant access after that period is over.

By default, access tokens generated for an application have a lifetime of one hour. This can be changed by updating the
`accessTokenLifetime` field of the relevant [`ClientApplication`](/docs/api/fhir/medplum/clientapplication). For example,
it can be set to `10m` to shorten the lifetime to ten minutes, or to `4h` to increase it to four hours.
