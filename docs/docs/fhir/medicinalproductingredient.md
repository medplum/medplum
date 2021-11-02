---
title: MedicinalProductIngredient
sidebar_position: 413
---

# MedicinalProductIngredient

An ingredient of a manufactured item or pharmaceutical product.

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
| identifier | 0..1 | Identifier | Identifier for the ingredient
| role | 1..1 | CodeableConcept | Ingredient role e.g. Active ingredient, excipient
| allergenicIndicator | 0..1 | boolean | If the ingredient is a known or suspected allergen
| manufacturer | 0..* | Reference | Manufacturer of this Ingredient
| specifiedSubstance | 0..* | BackboneElement | A specified substance that comprises this ingredient
| substance | 0..1 | BackboneElement | The ingredient substance

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |

