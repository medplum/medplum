---
sidebar_position: 0
---

# Communications

Communications in FHIR supports many common scenarios and can be used in concert with [Bots](/docs/bots/) to enable complex communications workflows. The first step is constructing a [Communication](/docs/api/fhir/resources/communication.mdx) FHIR resource. Adherence to the spec, referring to other relevant FHIR resources, and tagging the resource with LOINC, SNOMED or CPT codes can be useful here to aid in reporting, analytics and billing.

There are three top level considerations when designing communications:

1. Who (groups or individuals) should be the sender and recipient? (Identities)
2. Why was this communication initiated? (References)
3. What status is this communication in? (Status/workflow)

## Who should receive communications

Communication FHIR resources have a `sender`, a `recipient`, and a `subject` which should be populated appropriately. When multiple parties are involved [Group](/docs/api/fhir/resources/group.mdx), [CareTeam](/docs/api/fhir/resources/careteam.mdx), or [Organization](/docs/api/fhir/resources/organization.mdx) are involved, they can be linked as resources to the Communication resource for record keeping purposes.

A well structured **Communication resource serves as the basis for automation through [subscriptions](/docs/subscriptions/) and [bots](/docs/bots)**. For example, there could be a patient facing application with a messaging interface which creates a Communication FHIR resource with a CareTeam as recipient. A subscription on Communication resources then triggers a bot that sends an email to all `CareTeam.participants` notifying them that a new message is available.

Similar workflows can be built up to enable patient SMS, email notifications, or third party messaging integrations through subscriptions and bots.

## Why was this communication initiated

Keeping records of the topic and origin of communications. Using [codeable concepts](/docs/fhir-basics#standardizing-data-codeable-concepts) with common ontologies like LOINC, SNOMED or CPT as `Communication.topic` can be beneficial. Similarly `Communication.about` and `Communication.encounter` can be used to refer to other FHIR resources like AppointmentRequest or DiagnosticReport.

There are special resources for distinct communication types like `Consent` and `CommunicationRequest` that may be appropriate in specific contexts.

[Media](/docs/api/fhir/resources/media.mdx) resource is often linked to Communication resources as attachments for images, PDF, documents and the like.

## What is the status of this communication

Knowing whether a communication needs a response or follow up aids workflow. In this case `Communication.status` and `Communication.statusReason` are the appropriate fields.

## Reference

- [Communications Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Acommunications) on Github includes sample data.
