---
title: MedicinalProductPharmaceutical
sidebar_position: 424
---

# MedicinalProductPharmaceutical

A pharmaceutical product described in terms of its composition and dose form.

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
| identifier | 0..* | Identifier | An identifier for the pharmaceutical medicinal product
| administrableDoseForm | 1..1 | CodeableConcept | The administrable dose form, after necessary reconstitution
| unitOfPresentation | 0..1 | CodeableConcept | Todo
| ingredient | 0..* | Reference | Ingredient
| device | 0..* | Reference | Accompanying device
| characteristics | 0..* | BackboneElement | Characteristics e.g. a products onset of action
| routeOfAdministration | 1..* | BackboneElement | The path by which the pharmaceutical product is taken into or makes contact with the body

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| identifier | token | An identifier for the pharmaceutical medicinal product | MedicinalProductPharmaceutical.identifier
| route | token | Coded expression for the route | MedicinalProductPharmaceutical.routeOfAdministration.code
| target-species | token | Coded expression for the species | MedicinalProductPharmaceutical.routeOfAdministration.targetSpecies.code

