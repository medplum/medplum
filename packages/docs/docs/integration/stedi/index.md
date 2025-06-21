---
sidebar_position: 2
tags: [integration]
---

# Stedi Integration

## [Eligibility Checking](/docs/integration/stedi/eligibility-checks)

Send real time eligibility checks to Stedi based on a [CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest) resources, and receive a [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse) resource with the benefits information.

## Insurance Discovery (Coming Soon)

Perform insurance discovery searches for a patient. This is useful for patients who don't have their insurance card, or can't provide insurance details.

## Coordination of Benefits (Coming Soon)

If a patient has multiple health plans, determine:
- Overlapping coverage periods between plans
- Need for benefits coordination between overlapping plans 
- Payment responsibility and priority order among coordinated payers