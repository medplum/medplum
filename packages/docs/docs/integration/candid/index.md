---
sidebar_position: 3
tags: [integration]
---

# Candid Health Integration

When your application sends a claim to Candid, you also need to follow its status and know when the patient can be billed. These guides walk you from FHIR claim submission through patient balance synchronization and payment posting.

:::tip[Planning this integration?]
The [RCM & Billing Decision Guide](/docs/decision-guides/rcm-billing) walks through requirements questions and FHIR modeling decisions for billing — charge capture, eligibility, claims, and remittance — use it alongside these docs.
:::

[Candid Health](https://www.joincandidhealth.com/) is a revenue cycle automation provider. This integration supports professional claim submission, eligibility checks, remittance polling, and patient balance synchronization from FHIR resources.

[Contact Medplum](mailto:support@medplum.com) for integration access and to confirm availability for your project. The billing workflows require customer Candid credentials and enabled customer-scoped background processing. A submitted Claim first receives a ClaimResponse; polling tracks Candid claim status, while patient accounts receivable (AR) synchronization determines whether the patient balance can be invoiced. A successful submission alone does not make a balance collectible.

## [Claim Submission](/docs/integration/candid/claim-submission)

Submit professional medical claims to Candid Health from a FHIR [Claim](/docs/api/fhir/resources/claim) resource. The integration handles mapping patient demographics, provider information, diagnoses, and service lines into Candid's API format.

## [Eligibility Check](/docs/integration/candid/eligibility-check)

Check insurance eligibility before a visit using Candid's pre-encounter API. The operation returns a FHIR [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse) with benefit details mapped from the payer's 271 response.

## [Remittance polling](/docs/integration/candid/remittance-polling)

Use `candid-remittance-poller` to update Candid claim status and retain financial JSON snapshots linked to the Claim and ClaimResponse.

## [Patient billing](/docs/integration/candid/patient-billing)

Use `candid-sync-patient-balances` to create and refresh patient Invoices from Candid AR, and `candid-reconcile-patient-payments` to post confirmed payment receipts back to Candid. See the [end-to-end flow](/docs/integration/candid/patient-billing#billing-flow) for how these bots work with [Stripe](/docs/integration/stripe).
