---
tags:
  - subscription
---

# Subscriptions

Subscriptions are event-driven notifications, like webhooks, are are commonly used for integrations and automations. Medplum supports subscribing to changes on FHIR resources. There is a description [FHIR Subscriptions](https://www.hl7.org/fhir/subscription.html) on HL7.org that describes the functionality in detail.

- [Subscriptions](https://app.medplum.com/Subscription) can be created and updated on the [Medplum App](../app/index.md)
- Subscriptions are commonly used with [bots](../bots/bot-for-questionnaire-response/bot-for-questionnaire-response.md) and [questionnaires](../questionnaires/index.md) to enable complex workflows.
- [AuditEvents](https://app.medplum.com/AuditEvent) can be used to see a history of Subscription triggers and are useful in troubleshooting.
- [Subscription features and fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Asubscriptions) can be seen in detail on Github.

**Additional Documentation**

- Use the [subscription](/docs/tags/subscription) tag to quickly find all documentation related to Subscriptions
- [Resending Webhooks](/docs/api/fhir/operations/resend) describes the `$resend` operation for manually triggering webhooks
- [Subscription Extensions](./subscription-extensions.md) describes advanced subscription features that allow more fine-grained control and security
