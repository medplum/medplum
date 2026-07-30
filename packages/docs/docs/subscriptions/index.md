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

**Additional Documentation**

- Use the [subscription](/docs/tags/subscription) tag to quickly find all documentation related to Subscriptions
- [Resending Webhooks](/docs/api/fhir/operations/resend) describes the `$resend` operation for manually triggering webhooks
- [Subscription Extensions](/docs/subscriptions/subscription-extensions) describes advanced subscription features that allow more fine-grained control and security
- [WebSocket Subscriptions](/docs/react/use-subscription) describes WebSocket subscriptions and usage of them via the React `useSubscription` hook

## Subscriptions and Access Policies

Subscription notifications are evaluated against the [Access Policy](/docs/access/access-policies) of the subscription's author (the identity that created or last updated the `Subscription` resource). How that policy is enforced currently depends on the channel type:

- **WebSocket subscriptions**: the author's access policy is enforced on delivery. Resources outside the author's access policy are not delivered.
- **Rest-hook subscriptions**: the author's access policy is **not** currently enforced on delivery. If a triggering resource falls outside the author's access policy, the server logs a warning but still delivers the notification.

:::caution

Do not rely on an author's access policy to restrict what a rest-hook subscription can receive. Until enforcement ships, the effective scope of a rest-hook subscription is determined by its `criteria`, not by the author's access policy.

:::

Enforcement of the author's access policy for rest-hook deliveries is planned. See [#9520](https://github.com/medplum/medplum/issues/9520) for details and rollout status.

In the meantime, recommended practices for rest-hook subscriptions:

- **Use a trusted service identity.** Create and manage rest-hook subscriptions with a dedicated project-level identity (for example, a [ClientApplication](/docs/auth/client-credentials)) rather than end-user accounts, and scope its access policy to the resources the subscription legitimately needs.
- **Use account-level isolation where applicable.** For isolating data between accounts or tenants, use `AccessPolicy.compartment` together with `meta.accounts`. See [Access Policies](/docs/access/access-policies) for details.
- **Restrict who can create subscriptions.** Because `criteria` determines what a rest-hook subscription receives, use an access policy write constraint on the `Subscription` resource type to control which identities can create or modify subscriptions and what criteria they may use.
