---
title: Immunization
sidebar_position: 312
---

# Immunization

Describes the event of a patient being administered a vaccine or a record of an immunization as reported by a patient, a clinician or another party.

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
| identifier | 0..* | Identifier | Business identifier
| status | 1..1 | code | completed \| entered-in-error \| not-done
| statusReason | 0..1 | CodeableConcept | Reason not done
| vaccineCode | 1..1 | CodeableConcept | Vaccine product administered
| patient | 1..1 | Reference | Who was immunized
| encounter | 0..1 | Reference | Encounter immunization was part of
| occurrence[x] | 1..1 | dateTime | Vaccine administration date
| recorded | 0..1 | dateTime | When the immunization was first captured in the subject's record
| primarySource | 0..1 | boolean | Indicates context the data was recorded in
| reportOrigin | 0..1 | CodeableConcept | Indicates the source of a secondarily reported record
| location | 0..1 | Reference | Where immunization occurred
| manufacturer | 0..1 | Reference | Vaccine manufacturer
| lotNumber | 0..1 | string | Vaccine lot number
| expirationDate | 0..1 | date | Vaccine expiration date
| site | 0..1 | CodeableConcept | Body site vaccine  was administered
| route | 0..1 | CodeableConcept | How vaccine entered body
| doseQuantity | 0..1 | Quantity | Amount of vaccine administered
| performer | 0..* | BackboneElement | Who performed event
| note | 0..* | Annotation | Additional immunization notes
| reasonCode | 0..* | CodeableConcept | Why immunization occurred
| reasonReference | 0..* | Reference | Why immunization occurred
| isSubpotent | 0..1 | boolean | Dose potency
| subpotentReason | 0..* | CodeableConcept | Reason for being subpotent
| education | 0..* | BackboneElement | Educational material presented to patient
| programEligibility | 0..* | CodeableConcept | Patient eligibility for a vaccination program
| fundingSource | 0..1 | CodeableConcept | Funding source for the vaccine
| reaction | 0..* | BackboneElement | Details of a reaction that follows immunization
| protocolApplied | 0..* | BackboneElement | Protocol followed by the provider

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | Vaccination  (non)-Administration Date | Immunization.occurrence
| identifier | token | Business identifier | Immunization.identifier
| patient | reference | The patient for the vaccination record | Immunization.patient
| location | reference | The service delivery location or facility in which the vaccine was / was to be administered | Immunization.location
| lot-number | string | Vaccine Lot Number | Immunization.lotNumber
| manufacturer | reference | Vaccine Manufacturer | Immunization.manufacturer
| performer | reference | The practitioner or organization who played a role in the vaccination | Immunization.performer.actor
| reaction | reference | Additional information on reaction | Immunization.reaction.detail
| reaction-date | date | When reaction started | Immunization.reaction.date
| reason-code | token | Reason why the vaccine was administered | Immunization.reasonCode
| reason-reference | reference | Why immunization occurred | Immunization.reasonReference
| series | string | The series being followed by the provider | Immunization.protocolApplied.series
| status | token | Immunization event status | Immunization.status
| status-reason | token | Reason why the vaccine was not administered | Immunization.statusReason
| target-disease | token | The target disease the dose is being administered against | Immunization.protocolApplied.targetDisease
| vaccine-code | token | Vaccine Product Administered | Immunization.vaccineCode

