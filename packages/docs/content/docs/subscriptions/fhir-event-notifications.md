---
id: fhir-event-notifications
title: Implementing FHIR Event Notifications
sidebar_label: FHIR Event Notifications
weight: 10
docs_tags:
  - subscription
aliases:
  - /docs/bots/event-processing
---

Configure a Subscription to notify a Medplum Bot or your own HTTPS endpoint when a matching FHIR resource changes. This example sends a notification when a Patient is created. The same event criteria work for either destination.

Use [Running Backend Logic: Bots and Subscriptions](/docs/decision-guides/running-backend-logic#decision-2-where-should-this-subscription-send-notifications) to choose the destination and matching resource changes for each Subscription.

## Select the resource change

In a test project, create the following Subscription in the [Medplum App](https://app.medplum.com/Subscription) or through the FHIR API. Replace `<bot-id>` with your deployed Bot's ID. The endpoint alternative is described below. Keep the Subscription `off` until the destination is ready.

```json
{
  "resourceType": "Subscription",
  "status": "off",
  "reason": "Notify the registration integration when a Patient is created",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "Bot/<bot-id>",
    "payload": "application/fhir+json"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "create"
    }
  ]
}
```

- **`criteria: "Patient"`** selects Patient resources. Add supported FHIR search parameters to narrow the resource set.
- **`channel.type: "rest-hook"`** is the notification channel used for both a Bot destination and an HTTPS destination. `Bot/<bot-id>` selects the Bot.
- **The `create` interaction extension** excludes updates and deletions. Without interaction extensions, all three can trigger notifications. See [Subscription interactions](/docs/subscriptions/subscription-extensions#interactions).

Deletion notifications have a different payload. An HTTPS endpoint receives an empty JSON object and the resource identifier in `X-Medplum-Deleted-Resource`; a Bot receives the deleted resource under `event.input.deletedResource`. See [Subscriptions for delete events](/docs/subscriptions/subscription-extensions#subscriptions-for-delete-events).

Scope the criteria so writes made by your handler do not trigger an unintended loop. Check `meta.accounts` if an expected notification never arrives: account scope can exclude a resource even when its criteria match. See [Publish and Subscribe](/docs/subscriptions/publish-and-subscribe).

### Filter for a status transition

To react when a QuestionnaireResponse changes to `completed`, use a Bot whose handler accepts QuestionnaireResponse input. Replace the example's `reason`, `criteria`, and `extension` fields with:

```json
{
  "reason": "Handle a QuestionnaireResponse when its status changes to completed",
  "criteria": "QuestionnaireResponse?status=completed",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "update"
    },
    {
      "url": "https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression",
      "valueString": "%previous.status != %current.status"
    }
  ]
}
```

The search criteria select the completed state. The [FHIRPath expression](/docs/subscriptions/subscription-extensions#expression-based-criteria) compares the previous and current status, excluding later edits that leave the status completed. The `update` interaction excludes creation and deletion.

To also handle a response created in the completed state, add a second interaction extension with `valueCode: "create"` and use `%previous.id.exists() implies %previous.status != %current.status` as the expression. Testing the previous resource's `id` accounts for the absence of a prior version on creation.

## Use a Medplum Bot

1. Enable Bots for the project, create the Bot, and deploy its handler using [Bots in Production](/docs/bots/bots-in-production).
2. Configure its [AccessPolicy](/docs/access/access-policies) for the reads and writes it needs, and use [Bot secrets](/docs/bots/bot-secrets) for external credentials. Bots normally run with their own permissions; use [Run as User](/docs/bots/bot-run-as-user) when the handler should use the triggering identity's permissions.
3. Set the Subscription's `channel.endpoint` to `Bot/<bot-id>` and its `status` to `active` once the Bot is ready.

For the Patient creation example, the Bot receives the created Patient as `event.input`. Follow [Bot Basics](/docs/bots/bot-basics#editing-a-bot) for the handler signature and [automatic execution](/docs/bots/bot-basics#executing-automatically-using-a-subscription) to try the sample handler.

## Use your own endpoint

For the Patient creation example, keep its `criteria` and `create` interaction extension, and replace its `channel` with:

```json
{
  "type": "rest-hook",
  "endpoint": "https://your-service.example.com/medplum/patient-created",
  "payload": "application/fhir+json"
}
```

Medplum sends an HTTP POST containing the created Patient as FHIR JSON. Add the [Subscription signature extension](/docs/subscriptions/subscription-extensions#signatures) alongside the interaction extension and configure the same secret in your receiver. Verify the `X-Signature` header against the received request body and reject missing or invalid signatures before handling a notification. Enable the Subscription by setting `status` to `active` after deploying and verifying the receiver.

If the service needs to call the Medplum API, use a `ClientApplication` with [client credentials](/docs/auth/client-credentials) and an AccessPolicy limited to the required resources and actions. Keep credentials on the server.

Return a successful response after handling the notification. If you use a queue, durably save the event or work reference before acknowledging it, then track worker failures in your service. A successful HTTP response tells Medplum that delivery succeeded; your service remains responsible for any queued action.

## Handle repeated and delayed notifications

1. **Identify the intended action.** Give it a stable identifier so a repeated notification or manual resend can reuse the result. For example, an integration that registers each Patient once can use that Patient's resource ID as part of the action's identity.
2. **Prevent duplicate effects.** For generated FHIR resources, use identifier-based [conditional creation](/docs/fhir-datastore/working-with-fhir#creating-patient). Protect external actions separately with the destination API's idempotency mechanism, and reconcile uncertain outcomes before retrying.
3. **Account for later changes.** A resource may have changed again before the handler runs. Re-read current state when the action depends on current eligibility.

Subscriptions do not provide an ordered, permanent event history; an integration that requires every historical change needs its own retained records and recovery design.

## Monitor failures and recover

Subscription delivery records and Bot execution logs help diagnose failures. Confirm the intended action's completion using the resource or external system your handler updates.

Choose the recovery path for your destination:

- **Bot:** Inspect execution failures with [Monitoring and Recovering Bots](/docs/bots/monitoring-bots). A failed Bot handler can be recorded in its AuditEvent without triggering a Subscription retry. Setup errors can still retry, so keep the handler safe to repeat. Recover failed actions from the source resource and evidence of what already succeeded.
- **HTTPS endpoint:** Configure the [HTTP delivery retry policy](/docs/subscriptions/subscription-extensions#retry-policy) and monitor delivery failures. Retries are bounded and can be skipped when a newer resource version exists or the Subscription is inactive. Your service owns retries for actions it has already acknowledged.

After fixing a failure, an authorized administrator can use [`$resend`](/docs/api/fhir/operations/resend) to send selected Subscription notifications again. Inspect existing effects before replaying an action.

For the create-only Patient example, send `POST /fhir/R4/Patient/<patient-id>/$resend` with this body, replacing `<subscription-id>` with the Subscription's ID:

```json
{
  "interaction": "create",
  "subscription": "Subscription/<subscription-id>"
}
```

Specify `create` because `$resend` defaults to `update`, which this Subscription excludes. The instance URL uses the current resource version. To replay a particular historical version, use the [versioned `$resend` URL](/docs/api/fhir/operations/resend#resend-a-specific-version) and review its delivery limitations. If notifications were missed, reconcile source resources against the destination's results.

## Verify before enabling in production

In a test project, verify:

- A new Patient reaches the selected destination; updating that Patient does not trigger this create-only Subscription.
- The handler has the required permissions, and the Subscription's account scope includes the intended resources.
- A repeated notification preserves the intended result without duplicating the action.
- A handler failure is visible, and your recovery procedure completes the missing action safely.

For the transition variant, also test an update into `completed`, a later edit while still completed, and creation in the completed state according to your chosen policy. For an HTTPS receiver, verify that missing or invalid signatures are rejected.

Follow unit tests with a test of the deployed Subscription and destination.

For other Bot triggers, see [direct invocation](/docs/api/fhir/operations/bot-execute), [incoming webhooks](/docs/bots/consuming-webhooks), and [scheduled Bots](/docs/bots/bot-cron-job).
