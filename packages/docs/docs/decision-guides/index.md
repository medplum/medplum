---
sidebar_label: Designing Your Workflows
sidebar_position: 3
---

# Designing Your Workflows

Decision guides are companion documents to the Medplum docs. Each one walks through the requirements questions and FHIR modeling decisions for a specific workflow area — _who_ uses it, _what_ data flows through it, _how_ it integrates with other systems, and which Medplum primitives best fit each requirement.

The guides and the technical docs are designed to be used together:

- **The decision guide** structures a scoping conversation — it asks discovery questions about your use case (who's involved, when the workflow runs, what systems it touches), then walks through FHIR modeling decisions for the relevant features, covering trade-offs and which Medplum primitive fits when.
- **The technical docs** are the implementation reference — data model, APIs, React components, and worked examples that apply across scenarios.

You'll move back and forth between them. The decision guide gives scenario-specific recommendations ("if intake happens before the patient record exists, do X"); the technical docs explain the general capabilities in depth. For some modeling questions the guide is the more direct answer; for implementation details the docs go further.

## Available Guides

### Intake & Registration

Scope your intake workflow — who completes it and when, identity and duplicate handling, form library, prefill and reconciliation, extraction approach (SDC vs. Bot), coverage and consent modeling, and post-submission automation.

- **[Decision Guide →](/docs/decision-guides/intake)**
- **Docs:** [Intake & Registration](/docs/intake)

### Referrals

Scope your referral workflow — which sides of the lifecycle you build (send, receive, or both), referral semantics and coding, capture flow and recipient directory, what clinical context to carry, transmission channels, lifecycle and assignment, and closure round-trip.

- **[Decision Guide →](/docs/decision-guides/referrals)**
- **Docs:** [Referral Management](/docs/careplans/referrals)

### Charting

Scope your charting workflow — care setting and visit types, how structured the chart should be, parsing form responses into queryable data, signing requirements, and Visit Template ownership.

- **[Decision Guide →](/docs/decision-guides/charting)**
- **Docs:** [Charting](/docs/charting)

### Messaging & Communications

Scope your messaging workflow — thread structure, live updates, routing and assignment, read receipts, attachments, drafts and editing, automations, external channels (SMS, email), and async encounter billing.

- **[Decision Guide →](/docs/decision-guides/messaging)**
- **Docs:** [Messaging & Communications](/docs/communications)

### Access Control

Scope your authorization model — user types and organizational structure, multi-tenancy and patient/practitioner sharing, role inventory and permission mechanics, admin structure, and optional patterns like SMART on FHIR and IP access rules.

- **[Decision Guide →](/docs/decision-guides/access-control)**
- **Docs:** [Authorization and Access Control](/docs/access)

### RCM & Billing

Scope your billing workflow — charge capture, claims and clearinghouse integration, eligibility checks, coding and fee schedules, remittance and reconciliation, and patient billing.

- **[Decision Guide →](/docs/decision-guides/rcm-billing)**
- **Docs:** [Billing and Payments](/docs/billing)

### E-Prescribe

Scope your e-prescribing workflow — iframe vs. integrated prescribing UI, controlled substances, prescriber enrollment and identity verification, and vendor integration approach.

- **[Decision Guide →](/docs/decision-guides/e-prescribe)**
- **Docs:** [Medications](/docs/medications)

---

More guides will be added as additional workflow areas are scoped. If you'd like a guide for a workflow not listed here, reach out on our [Discord](https://discord.gg/medplum) or email [support@medplum.com](mailto:support@medplum.com).
