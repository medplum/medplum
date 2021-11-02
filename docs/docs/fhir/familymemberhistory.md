---
title: FamilyMemberHistory
sidebar_position: 291
---

# FamilyMemberHistory

Significant health conditions for a person related to the patient relevant in the context of care for the patient.

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
| identifier | 0..* | Identifier | External Id(s) for this record
| instantiatesCanonical | 0..* | canonical | Instantiates FHIR protocol or definition
| instantiatesUri | 0..* | uri | Instantiates external protocol or definition
| status | 1..1 | code | partial \| completed \| entered-in-error \| health-unknown
| dataAbsentReason | 0..1 | CodeableConcept | subject-unknown \| withheld \| unable-to-obtain \| deferred
| patient | 1..1 | Reference | Patient history is about
| date | 0..1 | dateTime | When history was recorded or last updated
| name | 0..1 | string | The family member described
| relationship | 1..1 | CodeableConcept | Relationship to the subject
| sex | 0..1 | CodeableConcept | male \| female \| other \| unknown
| born[x] | 0..1 | Period | (approximate) date of birth
| age[x] | 0..1 | Age | (approximate) age
| estimatedAge | 0..1 | boolean | Age is estimated?
| deceased[x] | 0..1 | boolean | Dead? How old/when?
| reasonCode | 0..* | CodeableConcept | Why was family member history performed?
| reasonReference | 0..* | Reference | Why was family member history performed?
| note | 0..* | Annotation | General note about related person
| condition | 0..* | BackboneElement | Condition that the related person had

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| code | token | A search by a condition code | FamilyMemberHistory.condition.code
| date | date | When history was recorded or last updated | FamilyMemberHistory.date
| identifier | token | A search by a record identifier | FamilyMemberHistory.identifier
| patient | reference | The identity of a subject to list family member history items for | FamilyMemberHistory.patient
| instantiates-canonical | reference | Instantiates FHIR protocol or definition | FamilyMemberHistory.instantiatesCanonical
| instantiates-uri | uri | Instantiates external protocol or definition | FamilyMemberHistory.instantiatesUri
| relationship | token | A search by a relationship type | FamilyMemberHistory.relationship
| sex | token | A search by a sex code of a family member | FamilyMemberHistory.sex
| status | token | partial \| completed \| entered-in-error \| health-unknown | FamilyMemberHistory.status

