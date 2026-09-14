---
sidebar_position: 1
---

# Billing

Your application may need to check coverage, submit insurance claims, and collect the patient's remaining balance. This section helps you choose the FHIR resources and integrations for each step.

:::tip[Planning this workflow?]
The [RCM & Billing Decision Guide](/docs/decision-guides/rcm-billing) walks through requirements questions and FHIR modeling decisions for billing — use it alongside these docs.
:::

The FHIR spec supports [many resources](/products/billing#fhir-resources) related to billing and payments. These resources can be created programmatically to support billing and payments. Commonly as part of a billing implementation, FHIR resources are created by applications and synchronized to clearinghouses or billing providers using [subscriptions](/docs/subscriptions) and [bots](/docs/bots/).

For example, after a lab test is completed, a [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport.mdx) is created, and it and related resources are automatically sent to a billing system after the report is finalized.

For billing insurance, the [Coverage](/docs/api/fhir/resources/diagnosticreport.mdx) resource is critical for representing a patient's insurance. Refer to our [Patient Insurance](/docs/billing/patient-insurance) guide for more information on properly storing patient insurance information.

## Coding

For resources to be billed appropriately, they often need to be tagged with CPT Codes, LOINC or SNOMED ontologies. To accomplish this, resources are often tagged with a [Codeable Concept](/docs/fhir-basics#standardizing-data-codeable-concepts). Coding will be determined by the service provided.

Through automation and integration, more complex scenarios like determining authorization or checking whether insurance is active can be automated via bots.

## Billing integrations

Use these guides when you are connecting your application to Candid or Stripe:

- [Candid Health](/docs/integration/candid) supports claim submission, remittance polling, and patient AR synchronization.
- [Stripe](/docs/integration/stripe) collects eligible patient balances through Checkout and records confirmed payments for source reconciliation.

[Contact Medplum](mailto:support@medplum.com) for access and availability. See the [patient billing flow](/docs/integration/candid/patient-billing#billing-flow) for the distinction between issued Invoice totals, current balance, and reconciliation state.

## Sample Integrations

These demo examples are separate from the integration bots described above. The [medplum-demo-bots](https://github.com/medplum/medplum-demo-bots) Github repository has sample billing integrations that demonstrate how to maintain and synchronize billing data.

- [Stripe demo](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/stripe-bots) integration shows how to keep invoices and payments synchronized between Medplum and Stripe.
- [Candid Health demo](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/candid-health) integration shows how to prepare an Encounter resource and associated metadata for submission.
