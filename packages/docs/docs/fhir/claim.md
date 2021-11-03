---
title: Claim
sidebar_position: 118
---

# Claim

A provider issued list of professional services and products which have been provided, or are to be provided, to a
  patient which is sent to an insurer for reimbursement.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..* | Identifier | Business Identifier for claim
| status | 1..1 | code | active \| cancelled \| draft \| entered-in-error
| type | 1..1 | CodeableConcept | Category or discipline
| subType | 0..1 | CodeableConcept | More granular claim type
| use | 1..1 | code | claim \| preauthorization \| predetermination
| patient | 1..1 | Reference | The recipient of the products and services
| billablePeriod | 0..1 | Period | Relevant time frame for the claim
| created | 1..1 | dateTime | Resource creation date
| enterer | 0..1 | Reference | Author of the claim
| insurer | 0..1 | Reference | Target
| provider | 1..1 | Reference | Party responsible for the claim
| priority | 1..1 | CodeableConcept | Desired processing ugency
| fundsReserve | 0..1 | CodeableConcept | For whom to reserve funds
| related | 0..* | BackboneElement | Prior or corollary claims
| prescription | 0..1 | Reference | Prescription authorizing services and products
| originalPrescription | 0..1 | Reference | Original prescription if superseded by fulfiller
| payee | 0..1 | BackboneElement | Recipient of benefits payable
| referral | 0..1 | Reference | Treatment referral
| facility | 0..1 | Reference | Servicing facility
| careTeam | 0..* | BackboneElement | Members of the care team
| supportingInfo | 0..* | BackboneElement | Supporting information
| diagnosis | 0..* | BackboneElement | Pertinent diagnosis information
| procedure | 0..* | BackboneElement | Clinical procedures performed
| insurance | 1..* | BackboneElement | Patient insurance information
| accident | 0..1 | BackboneElement | Details of the event
| item | 0..* | BackboneElement | Product or service provided
| total | 0..1 | Money | Total claim cost

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| care-team | reference | Member of the CareTeam | Claim.careTeam.provider
| created | date | The creation date for the Claim | Claim.created
| detail-udi | reference | UDI associated with a line item, detail product or service | Claim.item.detail.udi
| encounter | reference | Encounters associated with a billed line item | Claim.item.encounter
| enterer | reference | The party responsible for the entry of the Claim | Claim.enterer
| facility | reference | Facility where the products or services have been or will be provided | Claim.facility
| identifier | token | The primary identifier of the financial resource | Claim.identifier
| insurer | reference | The target payor/insurer for the Claim | Claim.insurer
| item-udi | reference | UDI associated with a line item product or service | Claim.item.udi
| patient | reference | Patient receiving the products or services | Claim.patient
| payee | reference | The party receiving any payment for the Claim | Claim.payee.party
| priority | token | Processing priority requested | Claim.priority
| procedure-udi | reference | UDI associated with a procedure | Claim.procedure.udi
| provider | reference | Provider responsible for the Claim | Claim.provider
| status | token | The status of the Claim instance. | Claim.status
| subdetail-udi | reference | UDI associated with a line item, detail, subdetail product or service | Claim.item.detail.subDetail.udi
| use | token | The kind of financial resource | Claim.use

