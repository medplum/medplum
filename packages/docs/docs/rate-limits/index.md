# Rate Limits

The Medplum API uses a number of safeguards against bursts of incoming traffic to help maximize its stability. Users who send many requests in quick succession might see error responses that show up as status code `429`.

## Default Rate Limits

| Category                      | Free tier                      | Paid tier                       |
| ----------------------------- | ------------------------------ | ------------------------------- |
| Auth (`/auth/*`, `/oauth2/*`) | 1 request per IP per second    | 1 request per IP per second     |
| Others                        | 100 requests per IP per second | 1000 requests per IP per second |

All rate limits are calculated per IP address on a 15 minute window.

Rate limits can be increased for paid plans. Please [contact us](mailto:info+rate-limits@medplum.com?subject=Increase%20rate%20limits) for more information.

## HTTP Headers

All API calls affected by rate limits will include the following headers:

- `X-Ratelimit-Limit`: The maximum number of requests that the consumer is permitted to make in a 15 minute window.
- `X-Ratelimit-Remaining`: The number of requests remaining in the current rate limit window.
- `X-Ratelimit-Reset`: The time at which the current rate limit window resets in UTC epoch seconds.

```
X-Ratelimit-Limit: 600
X-Ratelimit-Remaining: 599
X-Ratelimit-Reset: 1713810464
```
