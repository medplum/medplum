---
title: Condition
sidebar_position: 169
---

# Condition

A clinical condition, problem, diagnosis, or other event, situation, issue, or clinical concept that has risen to a level of concern.

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
| identifier | 0..* | Identifier | External Ids for this condition
| clinicalStatus | 0..1 | CodeableConcept | active \| recurrence \| relapse \| inactive \| remission \| resolved
| verificationStatus | 0..1 | CodeableConcept | unconfirmed \| provisional \| differential \| confirmed \| refuted \| entered-in-error
| category | 0..* | CodeableConcept | problem-list-item \| encounter-diagnosis
| severity | 0..1 | CodeableConcept | Subjective severity of condition
| code | 0..1 | CodeableConcept | Identification of the condition, problem or diagnosis
| bodySite | 0..* | CodeableConcept | Anatomical location, if relevant
| subject | 1..1 | Reference | Who has the condition?
| encounter | 0..1 | Reference | Encounter created as part of
| onset[x] | 0..1 | dateTime | Estimated or actual date,  date-time, or age
| abatement[x] | 0..1 | dateTime | When in resolution/remission
| recordedDate | 0..1 | dateTime | Date record was first recorded
| recorder | 0..1 | Reference | Who recorded the condition
| asserter | 0..1 | Reference | Person who asserts this condition
| stage | 0..* | BackboneElement | Stage/grade, usually assessed formally
| evidence | 0..* | BackboneElement | Supporting evidence
| note | 0..* | Annotation | Additional information about the Condition

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| code | token | Code for the condition | Condition.code
| identifier | token | A unique identifier of the condition record | Condition.identifier
| patient | reference | Who has the condition? | Condition.subject
| abatement-age | quantity | Abatement as age or age range | Condition.abatement.as(Age)
| abatement-date | date | Date-related abatements (dateTime and period) | Condition.abatement.as(dateTime)
| abatement-string | string | Abatement as a string | Condition.abatement.as(string)
| asserter | reference | Person who asserts this condition | Condition.asserter
| body-site | token | Anatomical location, if relevant | Condition.bodySite
| category | token | The category of the condition | Condition.category
| clinical-status | token | The clinical status of the condition | Condition.clinicalStatus
| encounter | reference | Encounter created as part of | Condition.encounter
| evidence | token | Manifestation/symptom | Condition.evidence.code
| evidence-detail | reference | Supporting information found elsewhere | Condition.evidence.detail
| onset-age | quantity | Onsets as age or age range | Condition.onset.as(Age)
| onset-date | date | Date related onsets (dateTime and Period) | Condition.onset.as(dateTime)
| onset-info | string | Onsets as a string | Condition.onset.as(string)
| recorded-date | date | Date record was first recorded | Condition.recordedDate
| severity | token | The severity of the condition | Condition.severity
| stage | token | Simple summary (disease specific) | Condition.stage.summary
| subject | reference | Who has the condition? | Condition.subject
| verification-status | token | unconfirmed \| provisional \| differential \| confirmed \| refuted \| entered-in-error | Condition.verificationStatus

