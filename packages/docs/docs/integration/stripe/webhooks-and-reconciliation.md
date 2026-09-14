---
sidebar_position: 3
---

# Webhooks and reconciliation

A patient can finish paying even if your application never receives the browser redirect. Webhooks let Stripe notify Medplum independently, and scheduled recovery checks work that was interrupted or missed.

This guide is for developers and operators responsible for payment processing. Complete the [Stripe integration prerequisites](/docs/integration/stripe#prerequisites) first. Reconciliation means checking the processor's payment evidence and bringing Medplum's records into agreement with it. Posting that payment to the billing source is a later step in the [shared billing flow](/docs/integration/candid/patient-billing#billing-flow).

## stripe-webhook

### Purpose

Verify incoming Stripe events and durably record supported events for background processing.

### Trigger and input

Stripe delivers HTTP webhooks to the provisioned customer webhook endpoint. The runtime must preserve the original raw request body and the `Stripe-Signature` header. This is a webhook entrypoint, not an application `executeBot()` call with reconstructed JSON.

### Result and resource changes

The bot verifies the signature with the customer's webhook signing secret, checks live/test mode and any supplied account ID, and conditionally saves a pending Basic event record before returning `{ "received": true }`. It stores event routing information and object IDs, not a full copy of the incoming payload.

Supported events include Checkout completion, asynchronous success/failure and expiration; PaymentIntent success/failure; refund creation/update; and dispute creation/update/closure. Other correctly signed events are acknowledged without creating work. Acknowledgment means durable receipt for supported events, not completed payment reconciliation.

### Failure and retry behavior

Missing raw body, missing/invalid signatures, mismatched environment/account, or failed persistence prevent successful acknowledgment. Stripe delivery retries reuse the same account/environment-scoped event record. Processing failures after acknowledgment are recovered by the worker and scheduled reconciler.

## stripe-reconcile-event

### Purpose

Process one persisted Stripe event promptly after webhook receipt.

### Trigger and input

A customer-scoped, **create-only Subscription** matches pending Stripe event Basic resources and passes the Basic resource to this bot. Only its ID is used; the bot re-reads and validates the stored event. Updates to attempts, leases, or completion do not retrigger this Subscription. This uses Medplum's [supported-interaction extension](/docs/subscriptions/subscription-extensions#interactions).

The Subscription worker executes as its provisioned Bot identity with a customer ProjectMembership and access policy. It does not inherit the webhook caller's identity. This differs from the caller-context `stripe-reconcile` entrypoint below; both must resolve the intended customer project and Stripe credentials.

### Result and resource changes

The worker verifies account binding and retrieves current Stripe objects to validate correlation and financial evidence. Confirmed full payment creates or reuses a patient-linked Basic receipt and reconciliation Task. An issued Invoice becomes `balanced`, its billing reconciliation becomes `pending` unless already under review, and its Checkout reservation is cleared when it matches the settled session. Issued totals and source balance are preserved for later source reconciliation.

Successful refunds produce refund receipts and hold collection pending reconciliation; disputes place collection under review. This workflow does not initiate refunds or resolve disputes. Completed events are marked complete and removed from the pending queue.

The result is `{ "events": 1, "sessions": 0, "failed": 0 }` for one completed event. `events` is zero for already-completed or leased work, `failed` is one for a processing failure, and `sessions` is always zero for this single-event worker.

### Failure and retry behavior

Leases and conditional writes coordinate concurrent workers; receipt identity prevents duplicate financial evidence. A failed event stays pending for scheduled recovery. Repeated failures create review work. A missed Subscription delivery does not lose the durable event, and repeated deliveries can resume incomplete resource writes.

## stripe-reconcile

### Purpose

Recover pending events and Checkout sessions, including work missed or interrupted by immediate event processing.

### Trigger and input

A customer-scoped Cron invokes scheduled recovery (the supplied schedule is every five minutes when enabled). With no `eventId`, the bot scans pending work. An authorized operator may also invoke it with an empty object or request replay using a Stripe event ID. The following fragment assumes an authenticated `MedplumClient` from `@medplum/core` and a provisioned `reconcileBotId`. Replace `evt_example123` with the event ID you need to recover:

```ts
// medplum is authenticated in the customer project.
// reconcileBotId is the provisioned stripe-reconcile Bot ID.
const result = await medplum.executeBot(reconcileBotId, {
  eventId: 'evt_example123',
});
```

This bot runs in the caller's context. Scheduled execution must select the customer identity; manual callers need the corresponding permissions and customer configuration. The replay ID is a Stripe `evt_...` ID, not a Medplum Basic ID.

### Result and resource changes

Each bounded run considers up to 25 pending events and 25 pending Checkout records. Event processing has the same receipt, Task, and Invoice effects described above. Session recovery checks Stripe for confirmed payments, expires invalid open sessions, and clears matching reservations after expiration. It never treats a timeout or local clock expiration alone as proof that payment did not occur.

For example, `{ "events": 2, "sessions": 3, "failed": 0 }` means the run completed two events, successfully examined three session records, and recorded no processing failures. These counts do not represent payment amounts or necessarily new payments.

A supplied `eventId` ensures a durable event exists and then runs the normal pending-work sweep. It can process other pending work; it does not guarantee that a particular event is processed immediately or force a completed event to run again.

### Failure and retry behavior

Failed work remains recoverable from stored state on a later run. Session recovery failures create review Tasks; repeated event failures also create review work. Ambiguous or mismatched processor evidence must be resolved before collection resumes. Once Medplum confirms a payment, the billing source's receipt consumer still needs to post it and confirm its AR balance; for Candid, see [patient payment reconciliation](/docs/integration/candid/patient-billing#candid-reconcile-patient-payments).
