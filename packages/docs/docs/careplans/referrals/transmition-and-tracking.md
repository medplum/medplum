---
title: Sending Referrals and Tracking Delivery
---

# Sending Referrals and Tracking Delivery

A fax receipt is useful evidence that something was delivered. The coordinator still needs to know whether the clinic accepted the referral and what happens next. Keep transport progress separate from the receiving team's clinical and operational decisions.

## Agree on What the Other System Can Receive {/* #choose-a-channel-and-payload */}

| Channel | Implementation considerations |
| --- | --- |
| FHIR API | Agree on supported profiles, identifiers, authentication, reference resolution, and acknowledgment behavior with the peer |
| PDF over an external channel | Generate a reviewed package, store it as DocumentReference/Binary, and send through the configured integration |
| C-CDA exchange | Use a generator and validator appropriate to the agreed document template and receiving system |
| In-app messaging | Use Medplum's Communication thread and message model, with referral context and document references |

A Bot can coordinate generation and transmission. For C-CDA, follow the [C-CDA integration guidance](/docs/integration/c-cda) and verify the capabilities of your chosen generator; producing XML does not establish template conformance.

Across systems, preserve the referral's business identifier and map local resource references. Agree on which party owns each update. Two servers may represent the same business request with different resource IDs.

## Keep the Package with Its Conversation {/* #record-the-conversation */}

Follow the [Messaging Data Model](/docs/communications/messaging-data-model):

- A thread header groups the conversation and has no `payload` or `partOf`.
- Each message has `partOf` pointing to the header and its own payload.
- Include all participants, including the sender or thread creator, in the recipient list used by the workflow.
- Set patient context on the header and each patient-related message. Access does not propagate through `partOf`.
- Use `about` to reference the ServiceRequest and `payload.contentReference` to reference the DocumentReference actually sent.

In Medplum's messaging convention, a sent message uses `status: in-progress` with `sent` populated. This is the message lifecycle, not the referral's acceptance or completion state. Track read receipts according to the [message-status guide](/docs/communications/read-receipts-and-message-status).

The [Worked Referral Example](/docs/careplans/referrals/fhir-resource-examples) includes a thread, message, and document linked to the same request.

## Match Delivery Receipts to the Right Send {/* #reconcile-delivery-acknowledgments */}

When a delivery callback arrives, the coordinator should be able to trace it to the exact package that was sent. Persist the external provider's message or transmission identifier in a namespaced `Communication.identifier`. Correlate callbacks to that identifier and retain the provider's evidence. Populate `received` only when the acknowledged event means receipt under the channel's agreed contract.

Use a delivery Task when staff need to own failures or missing acknowledgments. Its completion criterion might be confirmed delivery; a separate receiving-side Task records acceptance and processing. Avoid interpreting a successful API response as acceptance unless the integration contract explicitly gives it that meaning.

For callbacks, validate the source, deduplicate events, and handle out-of-order updates. A late delivery failure should not overwrite a later confirmed outcome without reconciliation.

## Retry Without Sending Duplicates

Before the external call, persist the intended send and a stable correlation key. Use the transport provider's idempotency feature when available. If a timeout leaves the outcome unknown, check the provider's state or route the item to staff before sending again.

:::caution[Check an uncertain send before trying again]

A FHIR transaction can make linked resource writes atomic. It cannot undo a fax or email already sent by another system. See [Automating Care Workflows](/docs/careplans/automating-workflows) for the distinction between repeatable FHIR writes and external side effects.

:::

Next, handle [receiving and triage](/docs/careplans/referrals/receiving-and-triage), or continue outbound follow-up with [Processing and Coordination](/docs/careplans/referrals/processing-and-coordination).
