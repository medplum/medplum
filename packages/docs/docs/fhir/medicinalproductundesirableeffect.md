---
title: MedicinalProductUndesirableEffect
sidebar_position: 429
---

# MedicinalProductUndesirableEffect

Describe the undesirable effects of the medicinal product.

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
| subject | 0..* | Reference | The medication for which this is an indication
| symptomConditionEffect | 0..1 | CodeableConcept | The symptom, condition or undesirable effect
| classification | 0..1 | CodeableConcept | Classification of the effect
| frequencyOfOccurrence | 0..1 | CodeableConcept | The frequency of occurrence of the effect
| population | 0..* | Population | The population group to which this applies

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| subject | reference | The medication for which this is an undesirable effect | MedicinalProductUndesirableEffect.subject

