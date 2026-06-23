---
sidebar_position: 2
tags: [integration]
---

# Stedi Integration

Medplum integrates with [Stedi](https://www.stedi.com/) for billing and revenue cycle workflows.

## Insurance eligibility

Send real-time eligibility and benefits checks (X12 270/271) using a [CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest) and receive a [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse).

- [Eligibility checks](/docs/integration/stedi/insurance-eligibility/eligibility-checks)

## Claim submission

Submit professional claims (X12 837P) to payers from a [Claim](/docs/api/fhir/resources/claim) resource using the `$stedi-submit-claim` operation. On success, Stedi's correlation ID is written back onto the claim for tracking.

- [Professional claims (837P)](/docs/integration/stedi/claim-submission/professional-claims)
