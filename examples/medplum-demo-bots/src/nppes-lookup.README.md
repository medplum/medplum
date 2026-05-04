# NPPES Lookup Bot

Thin pass-through wrapper around the [NPPES NPI Registry Read API v2.1](https://npiregistry.cms.hhs.gov/api-page).

The NPPES API is a public, unauthenticated CMS endpoint for looking up National Provider Identifier (NPI) records. This bot accepts an input object whose keys map 1:1 to the API's documented query parameters, builds the query string, makes a GET request, and returns the JSON response unmodified.

## Why thin?

LLM-driven or workflow-triggered bots often need a small, predictable building block to call NPPES — not a heavyweight FHIR mapper. Returning the raw response keeps this bot reusable. If you want a `Practitioner` resource at the end, wrap this bot in another that does the FHIR mapping.

## Input

See [`NppesLookupInput`](./nppes-lookup.ts) for the full list of fields. All fields are optional; `version=2.1` is set automatically and cannot be overridden.

| Field | Notes |
|---|---|
| `number` | 10-digit NPI |
| `first_name`, `last_name` | Individual providers; trailing wildcard `jo*` allowed (min 2 chars) |
| `organization_name` | Organizational providers; trailing wildcard allowed |
| `enumeration_type` | `NPI-1` (individual) or `NPI-2` (organizational) |
| `state`, `city`, `postal_code`, `country_code` | Address filters |
| `taxonomy_description` | Free-text taxonomy match |
| `limit` | 1–200, default 10 |
| `skip` | Up to 1000 |

NPPES will reject queries that are too broad — e.g. `state` alone — so combine criteria.

## Example: lookup by practitioner name

```ts
import { handler } from './nppes-lookup';

const result = await handler(medplum, {
  bot: { reference: 'Bot/<your-bot-id>' },
  input: {
    first_name: 'Jane',
    last_name: 'Doe',
    state: 'CA',
    enumeration_type: 'NPI-1',
    limit: 5,
  },
  contentType: 'application/json',
  secrets: {},
});

console.log(result.result_count, 'matches');
for (const provider of result.results) {
  console.log(provider.number, provider.basic?.first_name, provider.basic?.last_name);
}
```

The same query as a raw URL (useful for sanity-checking against the [interactive demo](https://npiregistry.cms.hhs.gov/demo-api)):

```
https://npiregistry.cms.hhs.gov/api/?version=2.1&first_name=Jane&last_name=Doe&state=CA&enumeration_type=NPI-1&limit=5
```

## Example: lookup by NPI number

```ts
const result = await handler(medplum, {
  bot: { reference: 'Bot/<your-bot-id>' },
  input: { number: '1234567893' },
  contentType: 'application/json',
  secrets: {},
});
```

## Deploy

The bot is registered in `medplum.config.json` as `nppes-lookup`:

```bash
npx medplum bot deploy nppes-lookup
```

No secrets are required — NPPES is unauthenticated.

## Errors

Non-2xx responses throw with the status code, status text, and body included in the error message. NPPES validation errors (e.g. "State must be combined with another criterion") return HTTP 200 with an `Errors` array on the body — callers should check `result.Errors` before trusting `result.results`.
