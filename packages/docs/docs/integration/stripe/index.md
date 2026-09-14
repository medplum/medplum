---
sidebar_position: 1
tags: [integration]
---

# Stripe integration

When a patient is ready to pay, your application needs to show the amount they owe and record the payment reliably. This integration lets you collect the full eligible patient balance with USD card payments, using either a Stripe-hosted page or Checkout embedded in your application.

Use these guides to connect your billing backend to the provisioned bots and display payment status in your patient portal. [Contact Medplum](mailto:support@medplum.com) for access and to confirm availability for your project.

## Prerequisites

Before you connect your application, work with Medplum to confirm:

- **Integration access:** provisioned Bot IDs and customer identities with the required access policies.
- **Stripe configuration:** your account credentials, test or live environment, webhook signing secret, and HTTPS success, cancel, and embedded return URLs. Embedded Checkout also needs the matching publishable key in your application.
- **Background processing:** webhook delivery that preserves the original request body, an active Subscription to process saved events, and a schedule to recover unfinished work.
- **An eligible Invoice:** a patient Invoice with current billing state from Candid or another compatible billing source.

Checkout creation is a trusted billing backend operation. Your portal backend first authorizes access to the Invoice using the patient's Medplum identity and compartment access policy, then invokes Checkout through a dedicated customer billing service identity with the required resource permissions. Patient clients should not receive permission to mutate billing state or Stripe Basic records. The read-only payment-state bot can use the authenticated identity authorized to read that Invoice. Keep Stripe secret credentials in the integration's server-side configuration.

## Bots

- [`stripe-create-checkout`](/docs/integration/stripe/checkout-and-payment-status#stripe-create-checkout) creates or reuses a Checkout session for an existing Invoice.
- [`stripe-payment-state`](/docs/integration/stripe/checkout-and-payment-status#stripe-payment-state) reads the Invoice's current billing state for your application.
- [`stripe-webhook`](/docs/integration/stripe/webhooks-and-reconciliation#stripe-webhook) verifies and durably acknowledges Stripe events.
- [`stripe-reconcile-event`](/docs/integration/stripe/webhooks-and-reconciliation#stripe-reconcile-event) processes one stored event from a create-only Subscription.
- [`stripe-reconcile`](/docs/integration/stripe/webhooks-and-reconciliation#stripe-reconcile) recovers pending events and Checkout sessions on a schedule or manual invocation.

## How Stripe uses your billing data

The integration uses a shared billing contract: conventions for representing an Invoice's collectible balance, a confirmed payment receipt, and a Task to reconcile that payment with the billing source. See the [billing flow](/docs/integration/candid/patient-billing#billing-flow) for the resource relationships.

Candid is one billing source; other billing sources can use Stripe when they implement the same contract, including current balance freshness, collection holds, receipt consumption, and source confirmation. An ordinary Invoice without that state is not sufficient.

The supported collection path takes the full current eligible balance, with a minimum of $0.50. Applications do not supply a price, partial amount, currency, or arbitrary return URL to the Checkout bot. Stripe collects the patient responsibility supplied by the billing source; it does not determine insurance coverage or calculate a patient's percentage. See the [self-pay and insurance examples](/docs/integration/candid/patient-billing#billing-flow).
