---
title: MedicinalProductManufactured
sidebar_position: 420
---

# MedicinalProductManufactured

The manufactured item as contained in the packaged medicinal product.

## Properties

| Name                    | Card  | Type               | Description                                                                                                       |
| ----------------------- | ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| id                      | 0..1  | string             | Logical id of this artifact                                                                                       |
| meta                    | 0..1  | Meta               | Metadata about the resource                                                                                       |
| implicitRules           | 0..1  | uri                | A set of rules under which this content was created                                                               |
| language                | 0..1  | code               | Language of the resource content                                                                                  |
| text                    | 0..1  | Narrative          | Text summary of the resource, for human interpretation                                                            |
| contained               | 0..\* | Resource           | Contained, inline Resources                                                                                       |
| extension               | 0..\* | Extension          | Additional content defined by implementations                                                                     |
| modifierExtension       | 0..\* | Extension          | Extensions that cannot be ignored                                                                                 |
| manufacturedDoseForm    | 1..1  | CodeableConcept    | Dose form as manufactured and before any transformation into the pharmaceutical product                           |
| unitOfPresentation      | 0..1  | CodeableConcept    | The “real world” units in which the quantity of the manufactured item is described                                |
| quantity                | 1..1  | Quantity           | The quantity or "count number" of the manufactured item                                                           |
| manufacturer            | 0..\* | Reference          | Manufacturer of the item (Note that this should be named "manufacturer" but it currently causes technical issues) |
| ingredient              | 0..\* | Reference          | Ingredient                                                                                                        |
| physicalCharacteristics | 0..1  | ProdCharacteristic | Dimensions, color etc.                                                                                            |
| otherCharacteristics    | 0..\* | CodeableConcept    | Other codeable characteristics                                                                                    |

## Search Parameters

| Name | Type | Description | Expression |
| ---- | ---- | ----------- | ---------- |
