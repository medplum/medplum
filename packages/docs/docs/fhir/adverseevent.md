---
title: AdverseEvent
sidebar_position: 63
---

# AdverseEvent

Actual or  potential/avoided event causing unintended physical injury resulting from or contributed to by medical care,
  a research study or other healthcare setting factors that requires additional monitoring, treatment, or hospitalization,
  or that results in death.

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
| identifier | 0..1 | Identifier | Business identifier for the event
| actuality | 1..1 | code | actual \| potential
| category | 0..* | CodeableConcept | product-problem \| product-quality \| product-use-error \| wrong-dose \|
  incorrect-prescribing-information \| wrong-technique \| wrong-route-of-administration \| wrong-rate \| wrong-duration \|
  wrong-time \| expired-drug \| medical-device-use-error \| problem-different-manufacturer \| unsafe-physical-environment
| event | 0..1 | CodeableConcept | Type of the event itself in relation to the subject
| subject | 1..1 | Reference | Subject impacted by event
| encounter | 0..1 | Reference | Encounter created as part of
| date | 0..1 | dateTime | When the event occurred
| detected | 0..1 | dateTime | When the event was detected
| recordedDate | 0..1 | dateTime | When the event was recorded
| resultingCondition | 0..* | Reference | Effect on the subject due to this event
| location | 0..1 | Reference | Location where adverse event occurred
| seriousness | 0..1 | CodeableConcept | Seriousness of the event
| severity | 0..1 | CodeableConcept | mild \| moderate \| severe
| outcome | 0..1 | CodeableConcept | resolved \| recovering \| ongoing \| resolvedWithSequelae \| fatal \| unknown
| recorder | 0..1 | Reference | Who recorded the adverse event
| contributor | 0..* | Reference | Who  was involved in the adverse event or the potential adverse event
| suspectEntity | 0..* | BackboneElement | The suspected agent causing the adverse event
| subjectMedicalHistory | 0..* | Reference | AdverseEvent.subjectMedicalHistory
| referenceDocument | 0..* | Reference | AdverseEvent.referenceDocument
| study | 0..* | Reference | AdverseEvent.study

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| actuality | token | actual \| potential | AdverseEvent.actuality
| category | token | product-problem \| product-quality \| product-use-error \| wrong-dose \| incorrect-prescribing-information \| wrong-technique \| wrong-route-of-administration \| wrong-rate \| wrong-duration \| wrong-time \| expired-drug \| medical-device-use-error \| problem-different-manufacturer \| unsafe-physical-environment | AdverseEvent.category
| date | date | When the event occurred | AdverseEvent.date
| event | token | Type of the event itself in relation to the subject | AdverseEvent.event
| location | reference | Location where adverse event occurred | AdverseEvent.location
| recorder | reference | Who recorded the adverse event | AdverseEvent.recorder
| resultingcondition | reference | Effect on the subject due to this event | AdverseEvent.resultingCondition
| seriousness | token | Seriousness of the event | AdverseEvent.seriousness
| severity | token | mild \| moderate \| severe | AdverseEvent.severity
| study | reference | AdverseEvent.study | AdverseEvent.study
| subject | reference | Subject impacted by event | AdverseEvent.subject
| substance | reference | Refers to the specific entity that caused the adverse event | AdverseEvent.suspectEntity.instance

