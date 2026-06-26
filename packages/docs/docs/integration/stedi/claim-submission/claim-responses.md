# Claim Responses (277 / 835)

This guide explains how Medplum ingests Stedi inbound claim responses: 277CA claim acknowledgments and 835 Electronic Remittance Advice (ERA). Webhooks are the primary path; an optional poller can catch missed events.

## Overview

After you [submit a professional claim](/docs/integration/stedi/claim-submission/professional-claims), payers respond asynchronously:

| Response | X12 | FHIR written |
|----------|-----|--------------|
| Claim acknowledgment | 277CA | [ClaimResponse](/docs/api/fhir/resources/claimresponse) |
| Remittance / payment | 835 ERA | [ClaimResponse](/docs/api/fhir/resources/claimresponse) + [PaymentReconciliation](/docs/api/fhir/resources/paymentreconciliation) |

Stedi notifies you via [`transaction.processed.v2` webhooks](https://www.stedi.com/docs/healthcare/configure-webhooks). The webhook delivers only the `transactionId` — your bot must fetch the full JSON from the [277 report](https://www.stedi.com/docs/healthcare/api-reference/get-healthcare-reports-277) or [835 report](https://www.stedi.com/docs/healthcare/api-reference/get-healthcare-reports-835) APIs. For 835, Medplum also fetches the [ERA PDF](https://www.stedi.com/docs/healthcare/api-reference/get-era-pdf) and stores it as a [DocumentReference](/docs/api/fhir/resources/documentreference) linked from `ClaimResponse`.

## Bots

| Bot identifier | Role |
|----------------|------|
| `stedi-claim-response-webhook` | Receives Stedi `transaction.processed.v2` events via `Bot/$execute` |
| `stedi-claim-response-poller` | Optional catch-up: polls Stedi for inbound 277/835 missed by the webhook |

Both bots use project secret `STEDI_CLAIM_API_KEY` (same key as claim submission).

## Correlation identifiers on Claim

The submit bot writes identifiers used to match inbound responses:

| System | Purpose |
|--------|---------|
| `https://www.stedi.com/claims` | Stedi correlation ID |
| `https://www.stedi.com/correlation-id` | Same correlation ID (277 batch matching) |
| `https://www.stedi.com/patient-control-number` | PCN sent on the 837 (835 matching) |
| `https://www.stedi.com/transactions/outbound` | Outbound 837 transaction ID when returned |

Ensure `patient-control-number` is set before submit — the submit bot assigns a PCN from the `Claim` id if you do not override it.

## Idempotency

Processing is idempotent on Stedi **inbound** `transactionId` (not webhook `event.id`):

- **277:** skip if `ClaimResponse` exists with `identifier` system `https://www.stedi.com/transactions/inbound`
- **835:** skip if `PaymentReconciliation` exists with the same inbound identifier

Replays of the same webhook with a new `event.id` are safely ignored.

## Configure Stedi webhooks

1. Deploy `stedi-claim-response-webhook` and note the `Bot/{id}`.
2. Create a [ClientApplication](/docs/auth/client-credentials) with an AccessPolicy that can execute the bot.
3. In [Stedi Webhooks](https://www.stedi.com/docs/healthcare/configure-webhooks):
   - **Credential set:** API Keys — `Authorization: Bearer {access_token}` from client credentials
   - **Endpoint:** `POST https://api.medplum.com/fhir/R4/Bot/{botId}/$execute`
   - **Event binding:** Transaction processed (optionally filter to 277 and 835)
4. Grant the bot an AccessPolicy to write `Claim`, `ClaimResponse`, `PaymentReconciliation`, `Organization`, `DocumentReference`, and `Binary`.

See [Consuming Webhooks](/docs/bots/consuming-webhooks) for AccessPolicy examples.

### Webhook payload

```json
{
  "detail-type": "transaction.processed.v2",
  "id": "8a9fc08a-24b2-4eeb-af7c-f96376ea471e",
  "detail": {
    "transactionId": "7647d644-9348-4596-a3b4-6830b8b48cc8",
    "x12": { "transactionSetIdentifier": "277" }
  }
}
```

The bot must return HTTP 200 within [5 seconds](https://www.stedi.com/docs/healthcare/configure-webhooks). Acknowledge quickly; processing runs in the same invocation for v0.

## Optional poller (catch-up)

The webhook is the primary path. `stedi-claim-response-poller` is an optional catch-up bot that polls Stedi's [Poll Transactions API](https://www.stedi.com/docs/api-reference/edi-platform/core/get-pollingtransactions) for `INBOUND` 277 and 835, storing its checkpoint on a `Basic` resource (`identifier`: `https://www.stedi.com/poller|stedi-claim-response-poller`).

Scheduling the poller is left to the customer. Medplum cron is bound to the `Bot` resource and runs in the bot's home project, so scheduling cron on a shared poller bot does not poll per customer project. A customer that wants automated catch-up should deploy and schedule the poller in its own project, where its cron executes in that project's context.

## Query claim status in FHIR

```http
GET ClaimResponse?request=Claim/{claimId}&_sort=-_lastUpdated
GET ClaimResponse?request=Claim/{claimId}&identifier=https://www.stedi.com/response-type|277
GET ClaimResponse?request=Claim/{claimId}&identifier=https://www.stedi.com/response-type|835
```

## Test workflow

Use Stedi's [test claims workflow](https://www.stedi.com/docs/healthcare/test-claims-workflow) with payer `STEDITEST` and `STEDI_CLAIM_TEST_MODE=true` on submit. Stedi generates test 277CA and 835 responses you can ingest via webhook or poller.

## Limitations (v0)

- Professional (837P) only
- No `file.failed.v2` alerting
- No Real-Time Claim Status (276/277) API
- Provider UI status display is not included (query `ClaimResponse` from your app)
