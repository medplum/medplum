---
sidebar_position: 4
---

# Creating CMS 1500

Medplum supports customizable creation of CMS 1500 for use in billing. 


The CMS 1500 form is a standardized form used in the United States to submit healthcare claims to Medicare and other health insurance providers. It is widely used by non-institutional providers and suppliers, such as physicians and outpatient clinics, to bill Medicare Part B and other insurers for services provided to patients. The CMS 1500 requires information about the patient, the medical services provided, and their costs. 

Medplum supports generating the CMS 1500 as plaintext and [PDF](/docs/bots/creating-a-pdf).  This guide explains how to create a text version of the CMS 1500 and what controls.

## CMS 1500 and FHIR

The data that fills the content of the CMS 1500 lives (largely) on the [Patient](/docs/api/fhir/resources/patient), [Coverage](/docs/api/fhir/resources/coverage), [Claim](/docs/api/fhir/resources/claim) and [Encounter](/docs/api/fhir/resources/encounter) FHIR resources.  Your charting process should accurately populate these resources to ensure streamlined billing.  

Commonly, the generation of the CMS 1500 is linked to the finalization of the encounter, for example when an Encounter.status is finished, a CMS 1500 is created and synchronized to clearinghouse or billing service.  Creating a `Subscription` where the `criteria` is `status=finished` is a minimum implementation of this workflow.

```
@Todo Create a bot that generates the CMS 1500 using the following data

Insurance and Patient Information
Insurance Type - Coverage.type
Insured's Name - Coverage.policyHolder
Patient's Name - Patient.name
Patient's Date of Birth and Gender - Patient.birthDate, Patient.gender
Insured's Address - Coverage.policyHolder (linked to a Patient or RelatedPerson resource which includes address)
Patient's Address - Patient.address
Patient Relationship to Insured - Coverage.beneficiary (linked to Patient indicating relationship)
Patient Status - Not directly available; could use Patient.maritalStatus and custom extensions for employment status.
Other Insured's Name - Coverage.policyHolder or a custom extension within Coverage if multiple coverages are recorded.
Other Insured's Policy or Group Number - Coverage.identifier
Other Insured's Date of Birth and Gender - RelatedPerson.birthDate, RelatedPerson.gender
Employer's Name or School Name - Custom extension or use Organization.name linked via Patient.employer or a similar construct.
Insurance Plan Name or Program Name - Coverage.class (value in a class that describes the plan)
Is there another Health Benefit Plan? - Multiple Coverage resources or a specific attribute in a custom extension.

Condition and Authorization
Date of Current Illness, Injury, or Pregnancy - Condition.onset[x] where x can be DateTime
Patient's Signature and Date - Consent resource linked to the Claim
Insured's Signature - Consent resource indicating insured's agreement

Services Provided
Date of Service - Claim.item.servicedDate
Place of Service - Claim.item.location (using Location resource reference)
EMG - Custom extension within Claim.item
CPT/HCPCS - Claim.item.productOrService
Modifiers - Claim.item.modifier
Diagnosis Pointer - Claim.item.diagnosisSequence
Charges - Claim.item.unitPrice
Days or Units - Claim.item.quantity
EPSDT Family Plan - Custom extension within Claim.item
ID Qualifier - Typically part of the identifier use in Provider.identifier
Rendering Provider ID - Claim.provider (provider reference)

Financials and Provider Information
Total Charge - Claim.total
Amount Paid - Custom extension on the Claim resource or possibly using the PaymentNotice resource.
Balance Due - Custom extension on the Claim resource calculated from total and payment.
Provider's Signature and Date - Claim.provider (attested by signature in a custom extension)
Service Facility Location Information - Claim.facility (using Location resource reference)
Billing Provider Info & PH # - Claim.provider or Claim.payee (where the provider can be organization or individual)

```

## Synchronizing Data

Data will need to be synchronized to a clearinghouse to initiate the claims process.

