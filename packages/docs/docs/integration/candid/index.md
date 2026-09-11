---
sidebar_position: 3
tags: [integration]
---

# Candid Health Integration

:::tip[Planning this integration?]
The [RCM & Billing Decision Guide](/docs/decision-guides/rcm-billing) walks through requirements questions and FHIR modeling decisions for billing — charge capture, eligibility, claims, and remittance — use it alongside these docs.
:::

[Candid Health](https://www.joincandidhealth.com/) is a revenue cycle automation provider. This integration enables payer lookup, insurance eligibility checks, and professional medical claim submission directly from FHIR resources.

## [Claim Submission](/docs/integration/candid/claim-submission)

Submit professional medical claims to Candid Health from a FHIR [Claim](/docs/api/fhir/resources/claim) resource. The integration handles mapping patient demographics, provider information, diagnoses, and service lines into Candid's API format.

## [Eligibility Check](/docs/integration/candid/eligibility-check)

Run real-time, pre-encounter insurance eligibility checks via Candid's pre-encounter API. Returns a FHIR [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse) with benefit details mapped from the payer's 271 response.

## [Payer Directory](/docs/integration/candid/payer-directory)

Search Candid's payer directory or fetch a payer by its Candid UUID. Returns FHIR [Organization](/docs/api/fhir/resources/organization) resources with the payer identifiers and clearinghouse support details needed for claim submission and eligibility checks.
