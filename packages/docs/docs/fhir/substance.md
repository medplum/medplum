---
title: Substance
sidebar_position: 561
---

# Substance

A homogeneous material with a definite composition.

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
| identifier | 0..* | Identifier | Unique identifier
| status | 0..1 | code | active \| inactive \| entered-in-error
| category | 0..* | CodeableConcept | What class/type of substance this is
| code | 1..1 | CodeableConcept | What substance this is
| description | 0..1 | string | Textual description of the substance, comments
| instance | 0..* | BackboneElement | If this describes a specific package/container of the substance
| ingredient | 0..* | BackboneElement | Composition information about the substance

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| category | token | The category of the substance | Substance.category
| code | token | The code of the substance or ingredient | Substance.code
| container-identifier | token | Identifier of the package/container | Substance.instance.identifier
| expiry | date | Expiry date of package or container of substance | Substance.instance.expiry
| identifier | token | Unique identifier for the substance | Substance.identifier
| quantity | quantity | Amount of substance in the package | Substance.instance.quantity
| status | token | active \| inactive \| entered-in-error | Substance.status
| substance-reference | reference | A component of the substance | Substance.ingredient.substance

