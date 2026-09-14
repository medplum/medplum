---
sidebar_position: 3
---

# Remittance polling

After you submit a Claim, its status can change as Candid processes it. Remittance polling checks for those changes and saves the financial details returned by Candid so your team can inspect them in Medplum.

## Before you start

[Contact Medplum](mailto:support@medplum.com) for access. You need:

- Candid API credentials: `CANDID_CLIENT_ID`, `CANDID_SECRET_ID`, and `CANDID_BASE_URL`.
- A customer-owned Cron resource that schedules the bot under the appropriate customer identity.
- ClaimResponses linked to Candid encounter and claim IDs by [claim submission](/docs/integration/candid/claim-submission).

## candid-remittance-poller

### Purpose

Refresh the source claim status and preserve the financial state returned by Candid for submitted claims. This bot does not create patient Invoices; [patient billing](/docs/integration/candid/patient-billing) uses Candid's patient AR data for that decision.

### Trigger and input

A scheduled customer-owned Cron invokes the bot with the Cron resource as input. It must have an ID and belong to the executing customer project. The bot scans that project's active ClaimResponses carrying Candid claim identifiers and uses their encounter and claim IDs to fetch the matching Candid claim. Responses must also reference the originating Claim and Patient.

### Result and resource changes

The bot updates the ClaimResponse's source-claim-status extension with Candid's status. This is distinct from FHIR `ClaimResponse.status` and submission `outcome`.

Each changed Candid claim JSON snapshot is saved as a patient-linked DocumentReference with a Binary attachment and references to the Claim and ClaimResponse. These snapshots contain Candid API JSON, **not original X12 835 files**. Identical snapshots are deduplicated by claim ID and content hash.

An illustrative return value is:

```json
{
  "scanned": 10,
  "skipped": 2,
  "fetched": 8,
  "changed": 3,
  "failed": 0,
  "failures": [],
  "completedSweep": true
}
```

Use these counts to understand the run:

- `scanned`: responses examined.
- `skipped`: responses that were ineligible or already paid.
- `fetched`: Candid encounter fetches; shared encounters are fetched once per run.
- `changed`: new or repaired snapshot attachments, not status updates.
- `failed` and `failures`: failed attempts and their ClaimResponse references with sanitized reasons.
- `completedSweep`: whether the saved scan position reached the end.

### Failure and retry behavior

A saved checkpoint resumes bounded runs. Optional `stopped` values are `busy` (another run holds the lease), `deadline`, and `upstream`. Authentication or rate-limit failures stop at the current row; other row failures are reported and retried on the next sweep. Version conflicts are retried with fresh source data on a later sweep. Interrupted snapshot attachment writes are repaired on retry.

Responses whose source status is `paid` or `finalized_paid` are skipped in subsequent polling. Use the separate patient AR synchronization workflow to maintain patient balances and confirm posted payments.
