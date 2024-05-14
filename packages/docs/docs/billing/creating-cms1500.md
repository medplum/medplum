---
sidebar_position: 4
---

# Creating CMS 1500

Medplum supports customizable creation of CMS 1500 for use in billing. 


The CMS 1500 form is a standardized form used in the United States to submit healthcare claims to Medicare and other health insurance providers. It is widely used by non-institutional providers and suppliers, such as physicians and outpatient clinics, to bill Medicare Part B and other insurers for services provided to patients. The CMS 1500 requires information about the patient, the medical services provided, and their costs. 

Medplum supports generating the CMS 1500 as plaintext and [PDF](/docs/bots/creating-a-pdf).  This guide explains how to create a text version of the CMS 1500 and what controls.

## CMS 1500 and FHIR

The data that fills the content of the CMS 1500 lives (largely) on the [Patient](/docs/api/fhir/resources/patient), [Coverage](/docs/api/fhir/resources/coverage), [Claim](/docs/api/fhir/resources/claim) and [Encounter](/docs/api/fhir/resources/encounter) FHIR resources.  Your charting process should accurately populate these resources to ensure streamlined billing.  

Commonly, the generation of the CMS 1500 is linked to the finalization of the encounter, for example when an Encounter.status is finished, a CMS 1500 is created and synchronized to clearinghouse or billing service.  Creating a `Subscription` where the `criteria` is `status=finished` is a minimum implementation of this workflow.  It is recommended to have implement generation of the CMS 1500 as a bot.

## Synchronizing Data

Data will need to be synchronized to a clearinghouse to initiate the claims process.

