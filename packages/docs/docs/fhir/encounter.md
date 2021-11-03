---
title: Encounter
sidebar_position: 244
---

# Encounter

An interaction between a patient and healthcare provider(s) for the purpose of providing healthcare service(s) or assessing the health status of a patient.

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
| identifier | 0..* | Identifier | Identifier(s) by which this encounter is known
| status | 1..1 | code | planned \| arrived \| triaged \| in-progress \| onleave \| finished \| cancelled +
| statusHistory | 0..* | BackboneElement | List of past encounter statuses
| class | 1..1 | Coding | Classification of patient encounter
| classHistory | 0..* | BackboneElement | List of past encounter classes
| type | 0..* | CodeableConcept | Specific type of encounter
| serviceType | 0..1 | CodeableConcept | Specific type of service
| priority | 0..1 | CodeableConcept | Indicates the urgency of the encounter
| subject | 0..1 | Reference | The patient or group present at the encounter
| episodeOfCare | 0..* | Reference | Episode(s) of care that this encounter should be recorded against
| basedOn | 0..* | Reference | The ServiceRequest that initiated this encounter
| participant | 0..* | BackboneElement | List of participants involved in the encounter
| appointment | 0..* | Reference | The appointment that scheduled this encounter
| period | 0..1 | Period | The start and end time of the encounter
| length | 0..1 | Duration | Quantity of time the encounter lasted (less time absent)
| reasonCode | 0..* | CodeableConcept | Coded reason the encounter takes place
| reasonReference | 0..* | Reference | Reason the encounter takes place (reference)
| diagnosis | 0..* | BackboneElement | The list of diagnosis relevant to this encounter
| account | 0..* | Reference | The set of accounts that may be used for billing for this Encounter
| hospitalization | 0..1 | BackboneElement | Details about the admission to a healthcare service
| location | 0..* | BackboneElement | List of locations where the patient has been
| serviceProvider | 0..1 | Reference | The organization (facility) responsible for this encounter
| partOf | 0..1 | Reference | Another Encounter this encounter is part of

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | A date within the period the Encounter lasted | Encounter.period
| identifier | token | Identifier(s) by which this encounter is known | Encounter.identifier
| patient | reference | The patient or group present at the encounter | Encounter.subject
| type | token | Specific type of encounter | Encounter.type
| account | reference | The set of accounts that may be used for billing for this Encounter | Encounter.account
| appointment | reference | The appointment that scheduled this encounter | Encounter.appointment
| based-on | reference | The ServiceRequest that initiated this encounter | Encounter.basedOn
| class | token | Classification of patient encounter | Encounter.class
| diagnosis | reference | The diagnosis or procedure relevant to the encounter | Encounter.diagnosis.condition
| episode-of-care | reference | Episode(s) of care that this encounter should be recorded against | Encounter.episodeOfCare
| length | quantity | Length of encounter in days | Encounter.length
| location | reference | Location the encounter takes place | Encounter.location.location
| location-period | date | Time period during which the patient was present at the location | Encounter.location.period
| part-of | reference | Another Encounter this encounter is part of | Encounter.partOf
| participant | reference | Persons involved in the encounter other than the patient | Encounter.participant.individual
| participant-type | token | Role of participant in encounter | Encounter.participant.type
| practitioner | reference | Persons involved in the encounter other than the patient | Encounter.participant.individual
| reason-code | token | Coded reason the encounter takes place | Encounter.reasonCode
| reason-reference | reference | Reason the encounter takes place (reference) | Encounter.reasonReference
| service-provider | reference | The organization (facility) responsible for this encounter | Encounter.serviceProvider
| special-arrangement | token | Wheelchair, translator, stretcher, etc. | Encounter.hospitalization.specialArrangement
| status | token | planned \| arrived \| triaged \| in-progress \| onleave \| finished \| cancelled + | Encounter.status
| subject | reference | The patient or group present at the encounter | Encounter.subject

