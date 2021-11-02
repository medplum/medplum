---
title: AllergyIntolerance
sidebar_position: 66
---

# AllergyIntolerance

Risk of harmful or undesirable, physiological response which is unique to an individual and associated with exposure to a substance.

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
| identifier | 0..* | Identifier | External ids for this item
| clinicalStatus | 0..1 | CodeableConcept | active \| inactive \| resolved
| verificationStatus | 0..1 | CodeableConcept | unconfirmed \| confirmed \| refuted \| entered-in-error
| type | 0..1 | code | allergy \| intolerance - Underlying mechanism (if known)
| category | 0..* | code | food \| medication \| environment \| biologic
| criticality | 0..1 | code | low \| high \| unable-to-assess
| code | 0..1 | CodeableConcept | Code that identifies the allergy or intolerance
| patient | 1..1 | Reference | Who the sensitivity is for
| encounter | 0..1 | Reference | Encounter when the allergy or intolerance was asserted
| onset[x] | 0..1 | dateTime | When allergy or intolerance was identified
| recordedDate | 0..1 | dateTime | Date first version of the resource instance was recorded
| recorder | 0..1 | Reference | Who recorded the sensitivity
| asserter | 0..1 | Reference | Source of the information about the allergy
| lastOccurrence | 0..1 | dateTime | Date(/time) of last known occurrence of a reaction
| note | 0..* | Annotation | Additional text not captured in other fields
| reaction | 0..* | BackboneElement | Adverse Reaction Events linked to exposure to substance

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| asserter | reference | Source of the information about the allergy | AllergyIntolerance.asserter
| category | token | food \| medication \| environment \| biologic | AllergyIntolerance.category
| clinical-status | token | active \| inactive \| resolved | AllergyIntolerance.clinicalStatus
| code | token | Code that identifies the allergy or intolerance | AllergyIntolerance.code
| criticality | token | low \| high \| unable-to-assess | AllergyIntolerance.criticality
| date | date | Date first version of the resource instance was recorded | AllergyIntolerance.recordedDate
| identifier | token | External ids for this item | AllergyIntolerance.identifier
| last-date | date | Date(/time) of last known occurrence of a reaction | AllergyIntolerance.lastOccurrence
| manifestation | token | Clinical symptoms/signs associated with the Event | AllergyIntolerance.reaction.manifestation
| onset | date | Date(/time) when manifestations showed | AllergyIntolerance.reaction.onset
| patient | reference | Who the sensitivity is for | AllergyIntolerance.patient
| recorder | reference | Who recorded the sensitivity | AllergyIntolerance.recorder
| route | token | How the subject was exposed to the substance | AllergyIntolerance.reaction.exposureRoute
| severity | token | mild \| moderate \| severe (of event as a whole) | AllergyIntolerance.reaction.severity
| type | token | allergy \| intolerance - Underlying mechanism (if known) | AllergyIntolerance.type
| verification-status | token | unconfirmed \| confirmed \| refuted \| entered-in-error | AllergyIntolerance.verificationStatus

