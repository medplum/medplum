---
sidebar_position: 3
---

# Sync Resources from Health Gorilla

This guide describes the `sync-resources-from-health-gorilla` bot, which fetches resources from Health Gorilla over a date range and synchronizes them into your Medplum project.

For the FHIR data model and how results are represented after they arrive, see [Receiving Results](./receiving-results). For the primary real-time delivery path, see [How results arrive in Medplum](./receiving-results#how-results-arrive-in-medplum) on that page.

## When to use this bot

Under normal operation, lab results are pushed from Health Gorilla to Medplum through webhook subscriptions handled by the `receive-from-health-gorilla` bot. Use `sync-resources-from-health-gorilla` when you need to **pull** data from Health Gorilla instead:

- A subscription or webhook failed and results were never delivered
- You are onboarding historical data or running a one-time backfill
- You are validating that Medplum matches Health Gorilla for a given time window
- You need to sync `Patient` records that were created in Health Gorilla but not yet in Medplum

Both bots use the same underlying sync logic (`syncResourceBundleFromHealthGorilla`), so resources created or updated by either path follow the same matching rules described in [Resolving orders with results](./receiving-results#resolving-orders-with-results).

## Supported resource types

| Resource type       | Typical use |
| ------------------- | ----------- |
| `DiagnosticReport` | Lab result summaries and their related observations, orders, and PDFs (recommended for backfilling results) |
| `Observation`      | Individual finalized lab values when you only need observation-level data |
| `Patient`          | Patient demographics synced from Health Gorilla |

For `DiagnosticReport` searches, the bot automatically includes related resources via `_include` (results, `basedOn` service requests, and related observations).

Only resources with status `final`, `corrected`, or `amended` are included in the search.

## Parameters

The bot accepts either a JSON object or a completed `QuestionnaireResponse` (see [Questionnaire trigger](#questionnaire-trigger)).

| Parameter                 | Required | Description |
| ------------------------- | -------- | ----------- |
| `resourceType`            | Yes      | `DiagnosticReport`, `Observation`, or `Patient` |
| `startDate`               | Yes      | ISO-8601 datetime. Start of the `_lastUpdated` window (exclusive lower bound: resources updated **after** this time) |
| `endDate`                 | Yes      | ISO-8601 datetime. End of the window (resources with `meta.lastUpdated` **before** this time are synced) |
| `createPatientIfMissing`  | No       | When `true`, creates a Medplum `Patient` if no match is found. Default: do not create patients |
| `syncOnlyMissing`         | No       | When `true`, skips resources that already exist in Medplum (matched by Health Gorilla identifier). Useful for idempotent backfills |

**Date range behavior:** Health Gorilla returns resources sorted by `_lastUpdated` (newest first). The bot searches for everything updated after `startDate`, then filters to resources whose `meta.lastUpdated` is strictly before `endDate`.

## Invoking the operation

The bot is exposed as the `$health-gorilla-sync-resources` operation on `Patient`, `DiagnosticReport`, and `Observation`. The resource ID in the URL is not used; any valid instance of those types (or a type-level POST on the resource name) is sufficient.

### Medplum CLI

```bash
medplum post -p <profile> 'Patient/example/$health-gorilla-sync-resources' '{
  "resourceType": "DiagnosticReport",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-02-01T00:00:00Z",
  "syncOnlyMissing": true
}'
```

### cURL

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Patient/example/\$health-gorilla-sync-resources" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "DiagnosticReport",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-02-01T00:00:00Z"
  }'
```

### Bot execute (by identifier)

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Bot/\$execute?identifier=https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/sync-resources-from-health-gorilla" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "DiagnosticReport",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-02-01T00:00:00Z",
    "createPatientIfMissing": true
  }'
```

On success the bot returns an `OperationOutcome` with `allOk`. If some resources fail to sync, the outcome includes an error issue per failure while other resources in the batch may have already been written.

## Questionnaire trigger

A `Questionnaire` is available at `https://www.medplum.com/integrations/health-gorilla/sync-resources-from-health-gorilla` with fields for `resourceType`, `startDate`, and `endDate`. When a `QuestionnaireResponse` is completed against that questionnaire, a subscription can invoke the bot automatically.

Optional boolean fields `createPatientIfMissing` and `syncOnlyMissing` are supported in bot input even if they are not present on the deployed questionnaire; pass them via JSON or extend the questionnaire in your project if you need them in a form-driven workflow.

## What gets synced

For each matching root resource, the bot:

1. Paginates through Health Gorilla search results in the requested date range
2. Splits multi-resource search bundles into one bundle per root resource
3. Flattens contained resources into top-level entries with rewritten references (same approach as `receive-from-health-gorilla`)
4. Calls the shared sync logic to upsert resources in Medplum, including PDF `DocumentReference` downloads where applicable

When syncing `DiagnosticReport` resources, related `ServiceRequest` resources may be created if they do not already exist (`allowedToCreate: ['ServiceRequest']`). Other resource types follow the same rules as the receive bot.

## Operational notes

- **Timeouts:** The bot may process many resources in one run. Large date ranges can exceed the default bot timeout (600 seconds in the shared deployment). Prefer smaller windows or `syncOnlyMissing: true` for repeat runs.
- **Subscriptions:** Ensure `setup-subscriptions` has been run so day-to-day results use `receive-from-health-gorilla`. Manual sync does not replace subscriptions; it recovers gaps.
- **Receive-only migrations:** When [migrating in receive-only mode](./index#migrating-to-health-gorilla-labs), combine placeholder orders in Medplum with a targeted `DiagnosticReport` sync for the migration window if webhooks were not yet active.
- **Quest preliminary results:** Quest may send multiple updates for the same report. Syncing an already-imported report updates it in place, consistent with webhook delivery.

## Related reading

- [Receiving Results](./receiving-results) — FHIR result model, PDFs, and order matching
- [Health Gorilla overview](./index) — migration phases and prerequisites
