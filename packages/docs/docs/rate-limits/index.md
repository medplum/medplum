# Rate Limits

The Medplum API uses a number of safeguards against bursts of incoming traffic to help maximize its stability. Users who
send many requests in quick succession may receive HTTP error responses with status code `429 Too Many Requests`.

## Number of Request Rate Limits

| Category                      | Free tier                        | Paid tier                         |
| ----------------------------- | -------------------------------- | --------------------------------- |
| Auth (`/auth/*`, `/oauth2/*`) | 60 request per IP per minute     | 60 request per IP per minute      |
| Others                        | 6,000 requests per IP per minute | 60,000 requests per IP per minute |

All rate limits are calculated per IP address over a one minute window.

Rate limits can be increased for paid plans. Please [contact us](mailto:info+rate-limits@medplum.com?subject=Increase%20rate%20limits) for more information.

## Total Load Rate Limit

In addition to limits on the number of requests that can be made to the Medplum server, there is a limit on the total load of the interactions made to the Medplum server. Different interactions with the datastore at weighted by complexity and impact, and **the sum of a user's interactions in a given minute** must remain under the user's total load limit in order to not receive a 429. 

## Reporting Request and Load Rate Limits: HTTP Headers

All API calls affected by rate limits will include a `RateLimit` header with details about the applicable limits:

```
RateLimit: "requests";r=59999;t=60, "fhirInteractions";r=49894;t=60
```

Each logical limit reports the number of units remaining (`r`) and the time remaining, in seconds, until
the limit resets (`t`). Applications should use these reported values to proactively slow down activity when
few units are remaining, in order to prevent service disruption. Once a `429 Too Many Requests` error is produced,
applications should not retry until after at least the indicated number of seconds have passed and the limit has
been reset.
