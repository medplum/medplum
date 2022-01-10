---
title: ExplanationOfBenefit
sidebar_position: 270
---

# ExplanationOfBenefit

This resource provides: the claim details; adjudication details from the processing of a Claim; and optionally account
balance information, for informing the subscriber of the benefits provided.

## Properties

| Name                  | Card  | Type            | Description                                            |
| --------------------- | ----- | --------------- | ------------------------------------------------------ |
| id                    | 0..1  | string          | Logical id of this artifact                            |
| meta                  | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules         | 0..1  | uri             | A set of rules under which this content was created    |
| language              | 0..1  | code            | Language of the resource content                       |
| text                  | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained             | 0..\* | Resource        | Contained, inline Resources                            |
| extension             | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension     | 0..\* | Extension       | Extensions that cannot be ignored                      |
| identifier            | 0..\* | Identifier      | Business Identifier for the resource                   |
| status                | 1..1  | code            | active \| cancelled \| draft \| entered-in-error       |
| type                  | 1..1  | CodeableConcept | Category or discipline                                 |
| subType               | 0..1  | CodeableConcept | More granular claim type                               |
| use                   | 1..1  | code            | claim \| preauthorization \| predetermination          |
| patient               | 1..1  | Reference       | The recipient of the products and services             |
| billablePeriod        | 0..1  | Period          | Relevant time frame for the claim                      |
| created               | 1..1  | dateTime        | Response creation date                                 |
| enterer               | 0..1  | Reference       | Author of the claim                                    |
| insurer               | 1..1  | Reference       | Party responsible for reimbursement                    |
| provider              | 1..1  | Reference       | Party responsible for the claim                        |
| priority              | 0..1  | CodeableConcept | Desired processing urgency                             |
| fundsReserveRequested | 0..1  | CodeableConcept | For whom to reserve funds                              |
| fundsReserve          | 0..1  | CodeableConcept | Funds reserved status                                  |
| related               | 0..\* | BackboneElement | Prior or corollary claims                              |
| prescription          | 0..1  | Reference       | Prescription authorizing services or products          |
| originalPrescription  | 0..1  | Reference       | Original prescription if superceded by fulfiller       |
| payee                 | 0..1  | BackboneElement | Recipient of benefits payable                          |
| referral              | 0..1  | Reference       | Treatment Referral                                     |
| facility              | 0..1  | Reference       | Servicing Facility                                     |
| claim                 | 0..1  | Reference       | Claim reference                                        |
| claimResponse         | 0..1  | Reference       | Claim response reference                               |
| outcome               | 1..1  | code            | queued \| complete \| error \| partial                 |
| disposition           | 0..1  | string          | Disposition Message                                    |
| preAuthRef            | 0..\* | string          | Preauthorization reference                             |
| preAuthRefPeriod      | 0..\* | Period          | Preauthorization in-effect period                      |
| careTeam              | 0..\* | BackboneElement | Care Team members                                      |
| supportingInfo        | 0..\* | BackboneElement | Supporting information                                 |
| diagnosis             | 0..\* | BackboneElement | Pertinent diagnosis information                        |
| procedure             | 0..\* | BackboneElement | Clinical procedures performed                          |
| precedence            | 0..1  | positiveInt     | Precedence (primary, secondary, etc.)                  |
| insurance             | 1..\* | BackboneElement | Patient insurance information                          |
| accident              | 0..1  | BackboneElement | Details of the event                                   |
| item                  | 0..\* | BackboneElement | Product or service provided                            |
| addItem               | 0..\* | BackboneElement | Insurer added line items                               |
| adjudication          | 0..\* |                 | Header-level adjudication                              |
| total                 | 0..\* | BackboneElement | Adjudication totals                                    |
| payment               | 0..1  | BackboneElement | Payment Details                                        |
| formCode              | 0..1  | CodeableConcept | Printed form identifier                                |
| form                  | 0..1  | Attachment      | Printed reference or actual form                       |
| processNote           | 0..\* | BackboneElement | Note concerning adjudication                           |
| benefitPeriod         | 0..1  | Period          | When the benefits are applicable                       |
| benefitBalance        | 0..\* | BackboneElement | Balance by Benefit Category                            |

## Search Parameters

| Name          | Type      | Description                                                         | Expression                                     |
| ------------- | --------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| care-team     | reference | Member of the CareTeam                                              | ExplanationOfBenefit.careTeam.provider         |
| claim         | reference | The reference to the claim                                          | ExplanationOfBenefit.claim                     |
| coverage      | reference | The plan under which the claim was adjudicated                      | ExplanationOfBenefit.insurance.coverage        |
| created       | date      | The creation date for the EOB                                       | ExplanationOfBenefit.created                   |
| detail-udi    | reference | UDI associated with a line item detail product or service           | ExplanationOfBenefit.item.detail.udi           |
| disposition   | string    | The contents of the disposition message                             | ExplanationOfBenefit.disposition               |
| encounter     | reference | Encounters associated with a billed line item                       | ExplanationOfBenefit.item.encounter            |
| enterer       | reference | The party responsible for the entry of the Claim                    | ExplanationOfBenefit.enterer                   |
| facility      | reference | Facility responsible for the goods and services                     | ExplanationOfBenefit.facility                  |
| identifier    | token     | The business identifier of the Explanation of Benefit               | ExplanationOfBenefit.identifier                |
| item-udi      | reference | UDI associated with a line item product or service                  | ExplanationOfBenefit.item.udi                  |
| patient       | reference | The reference to the patient                                        | ExplanationOfBenefit.patient                   |
| payee         | reference | The party receiving any payment for the Claim                       | ExplanationOfBenefit.payee.party               |
| procedure-udi | reference | UDI associated with a procedure                                     | ExplanationOfBenefit.procedure.udi             |
| provider      | reference | The reference to the provider                                       | ExplanationOfBenefit.provider                  |
| status        | token     | Status of the instance                                              | ExplanationOfBenefit.status                    |
| subdetail-udi | reference | UDI associated with a line item detail subdetail product or service | ExplanationOfBenefit.item.detail.subDetail.udi |
