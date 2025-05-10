# Rate Limits

The Medplum API uses a number of safeguards against bursts of incoming traffic to help maximize its stability. Users who
send many requests in quick succession may receive HTTP error responses with status code `429 Too Many Requests`.

## Request Rate Limits

| Category                      | Free tier                        | Paid tier                         |
| ----------------------------- | -------------------------------- | --------------------------------- |
| Auth (`/auth/*`, `/oauth2/*`) | 60 request per IP per minute     | 60 request per IP per minute      |
| Others                        | 6,000 requests per IP per minute | 60,000 requests per IP per minute |

All rate limits are calculated per IP address over a one minute window.

Rate limits can be increased for paid plans. Please [contact us](mailto:info+rate-limits@medplum.com?subject=Increase%20rate%20limits) for more information.

## FHIR Interaction Quota

In addition to limits on the number of requests that can be made to the Medplum server, there is a quota on the
data store interactions performed by the server on behalf of the client. This ensures, for example, that large batch
requests do not overwhelm the system by packing many expensive operations into single requests.

:::warning Feature Beta

FHIR interaction quotas are currently in beta testing, and are not yet finalized. Specific details about how
the limits are calculated and enforced are subject to change.

:::

FHIR uses [specific terminology](http://hl7.org/fhir/restful-interaction) to categorize different interactions with
the data store, e.g. `search` and `update`. These interactions are weighted by complexity and impact to the data store,
with the sum of each user's interactions in a given minute compared to the configured limit. There is also
a limit on the total interactions for all users within a Project as a whole, which defaults to ten times the per-user
limit.

## Reporting: HTTP Headers

All API calls affected by rate limits will include a `RateLimit` header with details about the applicable limits:

```
RateLimit: "requests";r=59999;t=60, "fhirInteractions";r=49894;t=60
```

Each logical limit reports the number of units remaining (`r`) and the time remaining, in seconds, until
the limit resets (`t`). Applications should use these reported values to proactively slow down activity when
few units are remaining, in order to prevent service disruption. Once a `429 Too Many Requests` error is produced,
applications should not retry until after at least the indicated number of seconds have passed and the limit has
been reset.
