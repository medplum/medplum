---
title: SpecimenDefinition
sidebar_position: 540
---

# SpecimenDefinition

A kind of specimen with associated set of requirements.

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
| identifier | 0..1 | Identifier | Business identifier of a kind of specimen
| typeCollected | 0..1 | CodeableConcept | Kind of material to collect
| patientPreparation | 0..* | CodeableConcept | Patient preparation for collection
| timeAspect | 0..1 | string | Time aspect for collection
| collection | 0..* | CodeableConcept | Specimen collection procedure
| typeTested | 0..* | BackboneElement | Specimen in container intended for testing by lab

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| container | token | The type of specimen conditioned in container expected by the lab | SpecimenDefinition.typeTested.container.type
| identifier | token | The unique identifier associated with the specimen | SpecimenDefinition.identifier
| type | token | The type of collected specimen | SpecimenDefinition.typeCollected

