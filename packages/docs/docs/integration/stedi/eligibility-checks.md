# Insurance Eligibility Checks

This guide explains how to model your FHIR resources for the Stedi integration to send and receive eligibility checks.

## Overview

The Stedi integration allows you to perform insurance eligibility checks by sending a a [CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest) resource and receiving a [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse) resource with the benefits information. This workflow is handled by our **Insurance Eligibility Bot**. Please contact the Medplum team to get access to this bot.

## Creating the Eligibility Check

```mermaid
flowchart TD
    CER["<div style='text-align: center;'><strong>CoverageEligibilityRequest</strong></div>"]

    ProviderOrg["<div style='text-align: center;'><strong>Organization (Provider)</strong></div><u>identifier</u>:<br>  system: http://hl7.org/fhir/sid/us-npi<br>  value: 1999999984"]

    Patient["<div style='text-align: center;'><strong>Patient (Subscriber)</strong></div>"]

    Coverage["<div style='text-align: center;'><strong>Coverage (Insurance)</strong></div> <div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>subscriberId</u>: AETNA12345<br>"]

    PayerOrg["<div style='text-align: center;'><strong>Organization (Payer)</strong></div><div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>identifier</u>:<br>  system: https://www.stedi.com/healthcare/network<br>  value: 60054</div>"]

    CER -->|provider| ProviderOrg
    CER -->|patient| Patient
    CER -->|insurance| Coverage
    CER -->|insurer| PayerOrg

    Coverage -->|subscriber| Patient
    Coverage -->|beneficiary| Patient
    Coverage -->|payor| PayerOrg

    classDef request fill:#8B57C4,stroke:#333,stroke-width:2px,color:#fff
    classDef organization fill:#B088E1,stroke:#333,stroke-width:2px,color:#fff
    classDef patient fill:#D4BCF2,stroke:#333,stroke-width:2px
    classDef coverage fill:#A5D6A7,stroke:#333,stroke-width:2px

    class CER request
    class PayerOrg,ProviderOrg organization
    class Patient patient
    class Coverage coverage
```

### CoverageEligibilityRequest
- `insurer`: Reference to the payer Organization (required)
- `provider`: Reference to the provider Organization (required)
- `subscriber`: Reference to the subscriber Patient (required)
- `insurance`: Array of Coverages. If there are more than one, the array item labeled as the focal will be used for the eligibility check (required)
- `servicedPeriod.start`: Optional, defaults to current date if not provided

### Organization (Payer)
- `identifier`: System must be `https://www.stedi.com/healthcare/network` (required)
- `name`: Organization name (required)

:::info
If you are using the Medplum Payer Directory, you can just use an Organization from that. It will have the correct Payer identifier and name.
:::

### Organization (Provider)
- `identifier`: System must be `http://hl7.org/fhir/sid/us-npi` (required)
- `name`: Organization name (required)

### Patient (Subscriber)
- `name.family`: Last name (required)
- `name.given`: First name (required)
- `birthDate`: Date of birth (required)
- `identifier`: System `http://hl7.org/fhir/sid/us-ssn` (optional but recommended)

### Coverage
- `subscriberId`: Insurance subscriber ID (required)
- `status`: Should be "active" (required)
- `subscriber`: Reference to a Patient or RelatedPerson (required)
- `beneficiary`: Reference to a Patient or RelatedPerson (required)
- `payor`: Reference to the payer Organization (required)

## Executing the Eligibility Check

The **Insurance Eligibility Bot** will execute the eligibility check by sending the CoverageEligibilityRequest resource to the Stedi API.

```ts
const response = await medplum.executeBot(
    {
      system: 'https://www.medplum.com/',
      value: 'eligibility',
    },
    coverageEligibilityRequest
);
```

## Receiving the Eligibility Response

After the eligibility check is sent, the **Insurance Eligibility Bot** will create and return a [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse) resource. This new CoverageEligibilityResponse will reference all of the resources from the request.

```mermaid
flowchart TD
    CER["<div style='text-align: center;'><strong>CoverageEligibilityRequest</strong></div>"]
    CEResp["<div style='text-align: center;'><strong>CoverageEligibilityResponse</strong></div>"]

    ProviderOrg["<div style='text-align: center;'><strong>Organization (Provider)</strong></div><u>identifier</u>:<br>  system: http://hl7.org/fhir/sid/us-npi<br>  value: 1999999984"]

    Patient["<div style='text-align: center;'><strong>Patient (Subscriber)</strong></div>"]

    Coverage["<div style='text-align: center;'><strong>Coverage (Insurance)</strong></div> <div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>subscriberId</u>: AETNA12345<br>"]

    PayerOrg["<div style='text-align: center;'><strong>Organization (Payer)</strong></div><div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>identifier</u>:<br>  system: https://www.stedi.com/healthcare/network<br>  value: 60054</div>"]

    CEResp -->|request| CER
    CEResp -->|requestor| ProviderOrg
    CEResp -->|patient| Patient
    CEResp -->|insurance| Coverage
    CEResp -->|insurer| PayerOrg

    classDef response fill:#57C48B,stroke:#333,stroke-width:2px,color:#fff
    class CEResp response
    classDef request fill:#8B57C4,stroke:#333,stroke-width:2px,color:#fff
    classDef organization fill:#B088E1,stroke:#333,stroke-width:2px,color:#fff
    classDef patient fill:#D4BCF2,stroke:#333,stroke-width:2px
    classDef coverage fill:#A5D6A7,stroke:#333,stroke-width:2px

    class CER request
    class PayerOrg,ProviderOrg organization
    class Patient patient
    class Coverage coverage
```

It will also contain the benefits information for the coverage in it's `insurance` field. 

CoverageEligibilityResponse.insurance will contain the benefits information for the coverage.

```ts
{
  "resourceType": "CoverageEligibilityResponse",
  "insurance": [
    {
      "coverage": "Coverage/123",
      "benefitBalance": [
        {
          "type": {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/benefit-type",
                "code": "benefit"
              }
            ]
          },
          "benefit": [
            {
              "type": {
                "coding": [
                  {
                    "system": "http://terminology.hl7.org/CodeSystem/benefit-type",
                    "code": "benefit"
                  }
                ]
              },
              "allowedMoney": {
                "value": 100,
                "currency": "USD"
              }
            }
          ]
        }
      ]
    }
  ]
  //..
}
```

## Different Subscriber and Beneficiary

If the subscriber and beneficiary are different, your Coverage resource will need to reference both the subscriber and beneficiary Patient resources. You will need to use this model for Coverage Eligibility checks that are not for the subscriber themselves. For example, if you are checking benefits for a spouse or child who is covered under their parent's insurance.

```mermaid
flowchart TD
    CER["<div style='text-align: center;'><strong>CoverageEligibilityRequest</strong></div>"]

    ProviderOrg["<div style='text-align: center;'><strong>Organization (Provider)</strong></div><u>identifier</u>:<br>  system: http://hl7.org/fhir/sid/us-npi<br>  value: 1999999984"]

    Patient["<div style='text-align: center;'><strong>Patient (Subscriber)</strong></div>"]

    Patient2["<div style='text-align: center;'><strong>Patient (Beneficiary)</strong></div>"]

    Coverage["<div style='text-align: center;'><strong>Coverage (Insurance)</strong></div> <div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>subscriberId</u>: AETNA12345<br>"]

    PayerOrg["<div style='text-align: center;'><strong>Organization (Payer)</strong></div><div style='border: 1px solid #333; padding: 4px; margin: 4px;'><u>identifier</u>:<br>  system: https://www.stedi.com/healthcare/network<br>  value: 60054</div>"]

    CER -->|provider| ProviderOrg
    CER -->|patient| Patient2
    CER -->|insurance| Coverage
    CER -->|insurer| PayerOrg

    Coverage -->|subscriber| Patient
    Coverage -->|beneficiary| Patient2
    Coverage -->|payor| PayerOrg

    classDef request fill:#8B57C4,stroke:#333,stroke-width:2px,color:#fff
    classDef organization fill:#B088E1,stroke:#333,stroke-width:2px,color:#fff
    classDef patient fill:#D4BCF2,stroke:#333,stroke-width:2px
    classDef coverage fill:#A5D6A7,stroke:#333,stroke-width:2px

    class CER request
    class PayerOrg,ProviderOrg organization
    class Patient patient
    class Coverage coverage
```

