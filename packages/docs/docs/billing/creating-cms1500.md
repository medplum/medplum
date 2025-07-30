---
sidebar_position: 4
---

# Creating CMS 1500

Medplum supports customizable creation of CMS 1500 for use in billing.

The CMS 1500 form is a standardized form used in the United States to submit healthcare claims to Medicare and other health insurance providers. It is widely used by non-institutional providers and suppliers, such as physicians and outpatient clinics, to bill Medicare Part B and other insurers for services provided to patients. The CMS 1500 requires information about the patient, the medical services provided, and their costs.



## CMS 1500 and FHIR

The data that fills the content of the CMS 1500 lives (largely) on the [Patient](/docs/api/fhir/resources/patient), [Coverage](/docs/api/fhir/resources/coverage), [Claim](/docs/api/fhir/resources/claim) and [Encounter](/docs/api/fhir/resources/encounter) FHIR resources. Your charting process should accurately populate these resources to ensure streamlined billing.

## Claim Export FHIR Operation

To export a claim as PDF you can use the following operation

```bash
curl 'https://api.medplum.com/fhir/R4/Claim/<CLAIM_ID>/$export' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```
