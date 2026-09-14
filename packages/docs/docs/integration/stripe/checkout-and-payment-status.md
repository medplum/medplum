---
sidebar_position: 2
---

# Checkout and payment status

Your patient portal needs a payment page that stays useful even after a Checkout session expires. This guide shows you how to request a session for an existing Invoice and read payment status when the patient returns.

## Before you start

Complete the [integration prerequisites](/docs/integration/stripe#prerequisites). The TypeScript examples are fragments for your existing application, not standalone scripts. They assume:

- `medplum` is an authenticated `MedplumClient` from `@medplum/core`. Use your trusted billing service client for Checkout, after authorizing the patient's Invoice access.
- `checkoutBotId` and `paymentStateBotId` contain your provisioned Bot IDs, not bot names.
- `invoiceId` is the ID of the patient's current stored Invoice.

Choose one Checkout mode below; the hosted and embedded calls are alternatives.

## stripe-create-checkout

### Purpose

Create or reuse a Stripe Checkout session for the full eligible current patient balance on an Invoice.

### Trigger and input

After authorizing the patient's Invoice access as described in the [prerequisites](/docs/integration/stripe#prerequisites), invoke from your backend with exactly an Invoice reference and `mode: 'hosted'` or `mode: 'embedded'`:

```ts
const checkout = await medplum.executeBot(checkoutBotId, {
  invoice: { reference: `Invoice/${invoiceId}` },
  mode: 'hosted',
});
```

For embedded Checkout:

```ts
const checkout = await medplum.executeBot(checkoutBotId, {
  invoice: { reference: `Invoice/${invoiceId}` },
  mode: 'embedded',
});
```

The bot reads the stored Invoice in the caller's customer project. The Invoice must belong to that project, reference a Patient, and meet all collection conditions:

- `status` is `issued`, `invoiceable` is `true`, and `reconciliation` is `current`.
- There is no hold or pending payment receipt.
- `balanceCents` is an integer of at least 50, in USD.
- The source refresh is no more than 15 minutes old and no more than one minute in the future.

### Result and resource changes

A hosted result includes a URL that your application uses to redirect the patient. The following response examples use synthetic session IDs, URLs, and secrets; replace them with the bot's actual response, never hard-code them:

```json
{
  "sessionId": "cs_test_example",
  "expiresAt": "2026-09-13T12:31:00.000Z",
  "url": "https://checkout.stripe.com/c/pay/cs_test_example"
}
```

An embedded result includes a client secret to pass to Stripe's embedded Checkout UI:

```json
{
  "sessionId": "cs_test_example",
  "expiresAt": "2026-09-13T12:31:00.000Z",
  "clientSecret": "cs_test_example_secret_example"
}
```

A new session expires 31 minutes after its creation request; reuse does not extend that expiration. The bot persists customer/session correlation records and reserves `activeCheckout` in the Invoice's billing state before creating the payable session.

#### Give patients a permanent payment page

Provide a payment-entry URL in your application. `https://billing.example.com/pay` is an illustrative URL; use your own application domain. When the patient opens it:

1. Authenticate the patient and authorize access to their current Invoice.
2. Read payment state with `stripe-payment-state`.
3. If collection is eligible, ask your backend to request Checkout. Redirect to the returned URL or pass the returned client secret to your embedded Checkout UI.
4. When the patient returns, refresh payment state to show whether payment has been confirmed or still needs reconciliation.

Share your application URL with patients. The Stripe URL expires, and an embedded client secret is not a permanent payment link. Your application owns this page; the bot does not create it.

### Failure and retry behavior

An open session is reused only when the Invoice remains eligible and its amount and Checkout mode match. A changed amount or mode requires expiration of the old session before replacement. Paid or completed sessions must be reconciled before another Checkout can be created.

Leases, saved reservations, and processor idempotency keys protect concurrent requests and recover interrupted creation. An uncertain creation result is held for reconciliation rather than blindly replaced. If the Invoice changes during creation, the bot expires the new session and asks the caller to retry. For transient conflicts, retry after refreshing payment state; for stale source data or holds, wait for source synchronization or operator resolution.

## stripe-payment-state

### Purpose

Return the stored Invoice's lifecycle status and shared billing state for application display and payment-entry decisions.

### Trigger and input

Read state before offering payment and after the patient returns from Checkout:

```ts
const paymentState = await medplum.executeBot(paymentStateBotId, {
  invoice: { reference: `Invoice/${invoiceId}` },
});
```

The input must contain a local Invoice reference. The read uses the authenticated caller's access.

### Result and resource changes

This is a read-only bot. It returns decoded billing state plus `status`, for example:

```json
{
  "source": "candid-health",
  "sourceId": "example-claim-id",
  "currency": "USD",
  "balanceCents": 500,
  "invoiceable": true,
  "sourceUpdatedAt": "2026-09-13T12:00:00.000Z",
  "reconciliation": "current",
  "status": "issued"
}
```

After confirmed payment, the same Invoice can report `status: balanced`, `reconciliation: pending`, and `pendingReceiptIds: ["Basic/example-receipt-id"]` while `balanceCents` still reflects the prior source balance. Optional `activeCheckout` includes `sessionId` and `expiresAt`; optional `holdReason` explains a collection hold. These properties come from an integration extension, not standard Invoice fields.

### Failure and retry behavior

Invalid references, inaccessible Invoices, or missing/malformed billing state fail the call. The bot does not query Stripe, refresh Candid, or prove Checkout eligibility on its own. A success redirect is not payment evidence: refresh this state after returning and while reconciliation is pending. The Checkout bot performs the authoritative collection checks, and [background reconciliation](/docs/integration/stripe/webhooks-and-reconciliation) records processor confirmation.
