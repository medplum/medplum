# Rate Limits

The Medplum API uses a number of safeguards against bursts of incoming traffic to help maximize its stability. Users who
send many requests in quick succession might see HTTP error responses with status code `429 Too Many Requests`.

## Default Rate Limits

| Category                      | Free tier                        | Paid tier                         |
| ----------------------------- | -------------------------------- | --------------------------------- |
| Auth (`/auth/*`, `/oauth2/*`) | 60 request per IP per minute     | 60 request per IP per minute      |
| Others                        | 6,000 requests per IP per minute | 60,000 requests per IP per minute |

All rate limits are calculated per IP address over a one minute window.

Rate limits can be increased for paid plans. Please [contact us](mailto:info+rate-limits@medplum.com?subject=Increase%20rate%20limits) for more information.

## HTTP Headers

All API calls affected by rate limits will include the following headers:

- `X-Ratelimit-Limit`: The maximum number of requests that the consumer is permitted to make in a one minute window.
- `X-Ratelimit-Remaining`: The number of requests remaining in the current rate limit window.
- `X-Ratelimit-Reset`: The time at which the current rate limit window resets in UTC epoch seconds.

```
X-Ratelimit-Limit: 600
X-Ratelimit-Remaining: 599
X-Ratelimit-Reset: 1713810464
```
