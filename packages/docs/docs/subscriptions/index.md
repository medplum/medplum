---
tags:
  - subscription
---

# Subscriptions

Subscriptions are event-driven notifications, like webhooks, and are commonly used for integrations and automations. Medplum supports subscribing to changes on FHIR resources. There is a description [FHIR Subscriptions](https://www.hl7.org/fhir/subscription.html) on HL7.org that describes the functionality in detail.

- [Subscriptions](https://app.medplum.com/Subscription) can be created and updated on the [Medplum App](/docs/app)
- Subscriptions are commonly used with [bots](/docs/bots/bot-for-questionnaire-response) and [questionnaires](/docs/questionnaires) to enable complex workflows.
- [AuditEvents](https://app.medplum.com/AuditEvent) can be used to see a history of Subscription triggers and are useful in troubleshooting.
- [Subscription features and fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Asubscriptions) can be seen in detail on Github.

:::warning[Limit of 1,000 persisted active Subscriptions per project]

When a resource changes, the server loads at most 1,000 persisted active Subscriptions in the project. Cached WebSocket listeners are added separately; this is not a combined limit on all listeners.

:::

## Planning Automations

Before using Subscriptions for intake, messaging, work queues, or migration side effects, decide:

- **Scale and triggers:** Keep persisted subscriptions within the project limit and scope their criteria to the required resources and events. Use [create/update and transition criteria](/docs/subscriptions/subscription-extensions) to avoid processing unrelated edits.
- **Tenant scope and execution identity:** A Subscription with `meta.accounts` only matches resources sharing at least one account, even when its search criteria match. Verify inherited account assignments as described in [Publish and Subscribe](/docs/subscriptions/publish-and-subscribe). A Bot normally uses its own membership; select [Run as User](/docs/bots/bot-run-as-user) deliberately. Do not assume the subscription author's policy defines the Bot's permissions.
- **Idempotency:** Use stable identifiers and conditional writes for generated resources. Track external deliveries separately so replaying an event does not duplicate a message, order, or payment.
- **Failure recovery:** Assign an owner for detecting and recovering failed work. Application-level Bot handler failures are not automatically retried by `subscription-max-attempts`; errors thrown during setup or invocation may still retry. External HTTP endpoints have a [configurable retry policy](/docs/subscriptions/subscription-extensions#retry-policy). Test recovery for the endpoint type you use.

**Additional Documentation**

- Use the [subscription](/docs/tags/subscription) tag to quickly find all documentation related to Subscriptions
- [Resending Webhooks](/docs/api/fhir/operations/resend) describes the `$resend` operation for manually triggering webhooks
- [Subscription Extensions](/docs/subscriptions/subscription-extensions) describes advanced subscription features that allow more fine-grained control and security
- [WebSocket Subscriptions](/docs/react/use-subscription) describes WebSocket subscriptions and usage of them via the React `useSubscription` hook
- [Server-Scoped Subscriptions](/docs/subscriptions/server-scoped-subscriptions) describes the self-hosted feature that lets a super admin create a single Subscription that fires across every project on the server
