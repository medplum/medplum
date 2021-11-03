---
title: MedicinalProductInteraction
sidebar_position: 418
---

# MedicinalProductInteraction

The interactions of the medicinal product with other medicinal products, or other forms of interactions.

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
| subject | 0..* | Reference | The medication for which this is a described interaction
| description | 0..1 | string | The interaction described
| interactant | 0..* | BackboneElement | The specific medication, food or laboratory test that interacts
| type | 0..1 | CodeableConcept | The type of the interaction e.g. drug-drug interaction, drug-food interaction, drug-lab test interaction
| effect | 0..1 | CodeableConcept | The effect of the interaction, for example "reduced gastric absorption of primary medication"
| incidence | 0..1 | CodeableConcept | The incidence of the interaction, e.g. theoretical, observed
| management | 0..1 | CodeableConcept | Actions for managing the interaction

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| subject | reference | The medication for which this is an interaction | MedicinalProductInteraction.subject

