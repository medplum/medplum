# Eligibility Check

This guide explains how to verify a patient's insurance coverage before an encounter using the Candid Health pre-encounter eligibility API.

## Overview

The eligibility check integration exposes a `$candid-check-eligibility` [custom operation](/docs/api/fhir/operations/custom-operations) on the [CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest) resource. It performs a **real-time, pre-encounter** eligibility check routed through Stedi, and returns a [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse) with the patient's benefit details mapped to FHIR.

:::note[Pre-encounter timing]
Running eligibility checks before the visit lets you catch lapsed coverage or incorrect plan information before care is delivered — when you can still address it with the patient, collect the correct co-pay at the door, or avoid a claim denial entirely. Candid also runs an automatic post-encounter check (free) as part of its rules engine, but pre-encounter checks give you the earliest possible signal.
:::

## Required Resources

```mermaid
flowchart TD
    CER["<div style='text-align: center;'><strong>CoverageEligibilityRequest</strong></div>"]
    Patient["<div style='text-align: center;'><strong>Patient (Subscriber)</strong></div>"]
    Beneficiary["<div style='text-align: center;'><strong>Patient (Beneficiary)</strong></div>"]
    Coverage["<div style='text-align: center;'><strong>Coverage</strong></div><div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>subscriberId</u>: MEM123<br><u>subscriber</u>: Patient ref<br><u>beneficiary</u>: Patient ref</div>"]
    ProviderOrg["<div style='text-align: center;'><strong>Organization (Provider)</strong></div><div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>identifier</u>:<br>  system: http://hl7.org/fhir/sid/us-npi</div>"]
    PayerOrg["<div style='text-align: center;'><strong>Organization (Payer)</strong></div><div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>identifier</u>:<br>  system: https://www.stedi.com/healthcare/network<br>  <i>or</i> https://www.joincandidhealth.com/chc-payerid</div>"]

    CER -->|patient| Patient
    CER -->|provider| ProviderOrg
    CER -->|insurer| PayerOrg
    CER -->|insurance.coverage| Coverage
    Coverage -->|subscriber| Patient
    Coverage -->|beneficiary| Beneficiary

    classDef cer fill:#8B57C4,stroke:#333,stroke-width:2px,color:#fff
    classDef org fill:#B088E1,stroke:#333,stroke-width:2px,color:#fff
    classDef patient fill:#D4BCF2,stroke:#333,stroke-width:2px
    classDef coverage fill:#A5D6A7,stroke:#333,stroke-width:2px

    class CER cer
    class ProviderOrg,PayerOrg org
    class Patient,Beneficiary patient
    class Coverage coverage
```

### CoverageEligibilityRequest

| Field | Description | Required |
|-------|-------------|----------|
| `patient` | Reference to the beneficiary Patient | Yes |
| `provider` | Reference to the provider Organization (must have NPI) | Yes |
| `insurer` | Reference to the payer Organization (must have Stedi or CHC payer ID) | Yes |
| `insurance[0].coverage` | Reference to the Coverage resource | Yes |
| `servicedDate` | Date of service for the eligibility check | No |
| `servicedPeriod.start` | Alternative to `servicedDate` | No |
| `item[].category` | X12 service type code to check (system: `https://x12.org/codes/service-type-codes`, e.g. `55` for Medical Nutrition Therapy). Defaults to `30` (Health Benefit Plan Coverage) when omitted. | No |

### Coverage

| Field | Description | Required |
|-------|-------------|----------|
| `subscriber` | Reference to the subscriber Patient | Yes |
| `beneficiary` | Reference to the beneficiary Patient | Yes |
| `subscriberId` | Insurance member ID | Yes |
| `payor` | Reference to the payer Organization | Yes |

If subscriber and beneficiary are different people (e.g. a child on a parent's plan), both must be populated and the bot will include a `dependent` field in the eligibility request.

### Organization (Provider)

| Field | Description | Required |
|-------|-------------|----------|
| `identifier` | NPI (system: `http://hl7.org/fhir/sid/us-npi`) | Yes |
| `name` | Organization name | Yes |

### Organization (Payer)

The payer identifier system for eligibility checks differs from claim submission — this API routes through Stedi, so use the Stedi payer network ID when available:

| Priority | Identifier | System |
|----------|-----------|--------|
| 1 | Stedi payer network ID | `https://www.stedi.com/healthcare/network` |
| 2 | Candid CHC payer ID | `https://www.joincandidhealth.com/chc-payerid` |

## Running a Check

Invoke the operation against a stored `CoverageEligibilityRequest`:

```ts
const response = await medplum.post(
  medplum.fhirUrl('CoverageEligibilityRequest', request.id, '$candid-check-eligibility')
);
```

Or at the type level with a `CoverageEligibilityRequest` in the request body:

```http
POST {base}/fhir/R4/CoverageEligibilityRequest/$candid-check-eligibility
```

## Response

On success the operation returns a `CoverageEligibilityResponse` saved to Medplum with coverage status, benefit details, and plan information mapped from the Stedi 271 response. A raw snapshot of the full Candid response is also stored as a `DocumentReference` (identifier system: `https://candidhealth.com/eligibility-check`) for debugging.

```json
{
  "resourceType": "CoverageEligibilityResponse",
  "status": "active",
  "purpose": ["benefits"],
  "patient": { "reference": "Patient/{id}" },
  "created": "2025-01-15",
  "insurer": { "reference": "Organization/{payer-id}" },
  "insurance": [
    {
      "coverage": { "reference": "Coverage/{id}" },
      "inforce": true,
      "item": [
        {
          "category": { "coding": [{ "code": "30", "display": "Health Benefit Plan Coverage" }] },
          "benefit": [
            { "type": { "text": "CoinsurancePercent" }, "allowedUnsignedInt": 20 }
          ]
        }
      ]
    }
  ]
}
```

The top-level `status` reflects the eligibility outcome:

| Value | Meaning |
|-------|---------|
| `active` | Coverage confirmed active |
| `cancelled` | Coverage not active or inactive |
| `entered-in-error` | Payer returned errors (check the raw DocumentReference snapshot) |

## Staging Mock Scenarios

Candid staging supports mock eligibility checks using specific magic values — no real payer is contacted. Mocks require provider NPI `1999999984`.

| Scenario | Payer ID | Subscriber | Member ID | Result |
|----------|----------|------------|-----------|--------|
| Active coverage | `60054` (Aetna) | Jane Doe, DOB `2004-04-04` | `AETNA12345` | Active |
| Payer unreachable | `87726` (UHC) | DOB `1970-01-01` | `UHCAAA42` | AAA 42 error |
| Missing subscriber ID | `87726` (UHC) | DOB `1990-01-01` | `UHCAAA72` | AAA 72 error |
| Missing subscriber name | `87726` (UHC) | DOB `1990-01-01` | `UHCAAA73` | AAA 73 error |
| Subscriber not found | `87726` (UHC) | DOB `1990-01-01` | `UHCAAA75` | AAA 75 error |

## Related Resources

- [Candid Health Eligibility API Reference](https://docs.joincandidhealth.com/api-reference/pre-encounter/eligibility-checks)
- [Claim Submission](/docs/integration/candid/claim-submission)
- [Billing Documentation](/docs/billing)
