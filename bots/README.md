# MedsScript Platform Billing / Metering Bots

Server-side [Medplum Bots](https://www.medplum.com/docs/bots) that meter billable
platform activity per clinic and produce a monthly invoice per clinic.

Each bot is a plain TypeScript function:

```ts
import type { BotEvent, MedplumClient } from '@medplum/core';
export async function handler(medplum: MedplumClient, event: BotEvent<T>): Promise<any> { ... }
```

## Billing model

A billable **transaction** is one of:

| Source resource     | Transaction type |
| ------------------- | ---------------- |
| `MedicationRequest` | `rx`             |
| `ServiceRequest`    | `diagnostic`     |
| Marketplace order   | `marketplace`\*  |

\*Marketplace orders share the same `ChargeItem` shape and plumbing (see
`src/constants.ts`); wiring a marketplace-order Subscription is left to you.

Charging is **per-clinic**. Clinics are FHIR `Organization` resources.

Billing plans are seeded as `Basic` resources:

- `identifier.system` = `https://medsscript.com/billing-plan`
- extension `https://medsscript.com/plan-name` (valueString)
- extension `https://medsscript.com/monthly-fee-usd` (valueDecimal)
- extension `https://medsscript.com/per-transaction-fee-usd` (valueDecimal)

## Bots

### `src/meter-transaction.ts`

Trigger: a `Subscription` firing on **create** of a `MedicationRequest` or a
`ServiceRequest`. For each event it:

1. Determines the transaction type (`rx` for `MedicationRequest`, `diagnostic` for `ServiceRequest`).
2. Resolves the patient (`subject`) and then the patient's clinic `Organization`.
3. Looks up the clinic's billing plan and its per-transaction fee.
4. Creates a `ChargeItem`:
   - `status: 'billable'`
   - `code` carrying the transaction type (system `https://medsscript.com/transaction-type`)
   - `subject` = patient, `performingOrganization` = clinic
   - `occurrenceDateTime` = the transaction's date (falls back to now)
   - `priceOverride` = `Money` with the per-transaction fee
   - an `identifier` (`clinicId|type|YYYY-MM|sourceRef`) and a `meta.tag`
     (`https://medsscript.com/billing-period` = `YYYY-MM`) so charges are queryable
     per clinic + type + month.

### `src/monthly-invoice.ts`

Trigger: a **scheduled** `Subscription` (cron), once per billing period. For each
clinic `Organization` it:

1. Sums the current month's `ChargeItem`s for that clinic (queried by
   `performing-organization` + the billing-period `_tag`), grouped by transaction type.
2. Adds the clinic's monthly subscription fee (from its plan).
3. Creates an `Invoice`:
   - `status: 'issued'`, `recipient` = clinic
   - one `lineItem` per usage type, plus one for the subscription fee
   - `totalGross` = usage + subscription
   - idempotent per clinic + month via `createResourceIfNoneExist`
     (identifier system `https://medsscript.com/monthly-invoice`).

**Where the run-period comes from:** on a schedule Medplum passes no meaningful
input, so the bot defaults to the **current month** (`getBillingPeriod(new Date())`).
To back-fill a specific month, execute the bot with an input object
`{ "billingPeriod": "YYYY-MM" }` — the bot honours it when present.

## Assumptions baked in (please confirm)

1. **Clinic → plan mapping.** A clinic `Organization` is linked to its plan by carrying
   an `identifier` whose `system` is `https://medsscript.com/billing-plan` and whose
   `value` equals the plan `Basic`'s identifier value (same system + value on both). The
   alternative would be an explicit reference extension on the Organization.
2. **Clinic derivation from a transaction.** The clinic is, in priority order: (1) the
   transaction's `requester`/`performer` if that reference is an `Organization`, else
   (2) the patient's `managingOrganization`. In practice the requester is usually a
   Practitioner, so `patient.managingOrganization` is the reliable signal — this assumes
   patients are assigned a `managingOrganization` at intake.
3. **Patient subject.** `ServiceRequest.subject` can be a Group/Location/Device in FHIR,
   but we assume it is a `Patient` for telehealth flows and read it as such.
4. **Default per-transaction fee.** If a clinic's plan or its per-transaction fee cannot
   be resolved, the transaction is still metered at `DEFAULT_PER_TRANSACTION_FEE_USD`
   (currently `2.0`) rather than being dropped. Unresolved **monthly** fees default to `0`.
5. **Currency.** All `Money` amounts are `USD`.
6. **One charge per transaction.** Each transaction create yields exactly one `ChargeItem`;
   updates/re-fires of the same source resource are not de-duplicated at metering time
   (the `ChargeItem` identifier embeds the source ref, so you can de-dupe downstream if needed).
7. **Organization = clinic.** Every `Organization` is treated as a billable clinic by the
   invoice bot; if you also model payers/labs as Organizations, add a filter.

## Deployment (staged for you — requires auth)

> These steps require an authenticated Medplum session, so they are **not** run here.

1. **Compile the bots.** From `bots/`:
   ```bash
   npm install
   npx tsc --noEmit   # type-check
   ```
   Bundle each handler to a single file (esbuild) or paste the source when creating the
   Bot resource. (Only `src/*.ts` compile to a handler; `src/constants.ts` is a shared
   import — if you bundle, it is inlined; if you paste, inline the constants.)

2. **Seed billing plans** as `Basic` resources (one per plan) with the identifier system
   and the three extensions listed above. Add the matching `identifier`
   (`https://medsscript.com/billing-plan` + the plan's value) to each clinic `Organization`.

3. **Create the Bot resources** in Medplum (Admin → Bots, or via the API/CLI):
   - `meter-transaction` — code from `src/meter-transaction.ts`
   - `monthly-invoice` — code from `src/monthly-invoice.ts`

4. **Deploy code** to each Bot (the Medplum app "Deploy" button, or `medplum bot deploy`).

5. **Create Subscriptions** that invoke the metering bot:
   - Subscription with `criteria: MedicationRequest`,
     channel `type: rest-hook`, `endpoint: Bot/<meter-transaction-id>`.
     Optionally restrict to creates via a fhirpath criteria extension.
   - Subscription with `criteria: ServiceRequest`, same channel → `Bot/<meter-transaction-id>`.

6. **Schedule the invoice bot.** Create a Subscription with a cron channel that invokes
   `Bot/<monthly-invoice-id>` — e.g. `0 2 1 * *` (02:00 on the 1st of each month) to
   invoice the month that just closed. See
   https://www.medplum.com/docs/bots/bot-cron-job for cron subscription setup.

Nothing here has been deployed; all of the above is left for an authenticated operator.
