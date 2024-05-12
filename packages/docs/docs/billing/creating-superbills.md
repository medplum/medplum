---
sidebar_position: 5
---

# Creating Superbills

Medplum supports customizable creation of superbills. 

A superbill is a detailed form used by healthcare providers that outlines the services provided to a patient. It is typically given to patients after their medical appointments so they can submit it to their insurance companies for reimbursement.  Superbills are important in settings where the provider does not directly bill the insurance company, such as in many out-of-network situations or when services are provided by a provider who operates on a cash-only basis.

Similar to the generation of the [CMS 1500](/docs/billing/creating-cms1500) the Superbill is typically generated when an encounter is finished.  The following bot creates a Superbill as PDF and attaches it to a `Claim` resource.

```
@Todo create a bot that generates superbill pdf with the following

1. Provider Information:
Provider’s name, Practice name, Address, Phone number - Practitioner.name, Organization.name, Address, ContactPoint.
National Provider Identifier (NPI), Tax Identification Number (TIN), Provider’s license number - These would be in Practitioner.identifier with different system values indicating the type of identifier.
2. Patient Information:
Patient’s name, Date of birth, Address, Phone number - Patient.name, Patient.birthDate, Patient.address, Patient.telecom.
Patient's insurance ID number - Coverage.beneficiary where the beneficiary is a reference to the Patient.
Relationship to the insured, Insured’s name - Coverage.relationship, Coverage.policyHolder.
3. Visit Information:
Date of service, Time of service, Place of service - Encounter.period, Encounter.serviceType, Encounter.location.
4. Billing Information:
Diagnosis codes (ICD-10), Procedure codes (CPT/HCPCS), Modifiers - These are part of Claim.diagnosis.diagnosis[x] for ICD codes and Claim.item.productOrService, Claim.item.modifier for procedure codes and modifiers.
Description of each service, Charges for each service, Total charges, Payments already made, Balance due - These are captured in Claim.item.detail, Claim.item.unitPrice, Claim.total, Claim.payment, and custom extensions for balances not explicitly defined in FHIR.
5. Additional Information:
Referring provider’s name and NPI, Prior authorization number - Claim.supportingInfo where it can reference Practitioner for the referring provider and include data elements for authorization numbers.
Type of visit, Notes on special circumstances or treatments, Patient’s signature and date - Also part of Claim.supportingInfo or Encounter.type for visit types, with narrative notes potentially included as Annotation or through custom extensions.
6. Insurance Information:
Name of the insurance company, Claim mailing address, Group number, Policy number - Coverage.issuer (reference to an Organization), Coverage.grouping, and Coverage.identifier.

```

Superbills are typically not synchronized to external systems, but are sent to payors via patients or directly as a bill for out of network services.