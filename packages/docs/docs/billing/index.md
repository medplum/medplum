---
sidebar_position: 1
---

# Billing

The FHIR spec supports [many resources](/products/billing#fhir-resources) related to billing and payments. These resources can be created programmatically to support billing and payments. Commonly as part of a billing implementation, FHIR resources are created by applications and synchronized to clearinghouses or billing providers using [subscriptions](/docs/subscriptions) and [bots](/docs/bots/).

For example, after a lab test is completed, a [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport.mdx) is created and it and related resources like are automatically sent to a billing system after the report is finalized.

## Coding

For resources to be billed appropriately, they often need to be tagged with CPT Codes, LOINC or SNOMED ontologies. To accomplish this, resources are often tagged with a [Codeable Concept](/docs/fhir-basics#codeable-concepts-standarding-data). Coding will be determined by the service provided.

Through automation and integration, more complex scenarios like determining authorization or checking whether insurance is active can be automated via [bots](/docs/bots/insurance-eligibility-check.md).
