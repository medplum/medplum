---
title: NutritionOrder
sidebar_position: 448
---

# NutritionOrder

A request to supply a diet, formula feeding (enteral) or oral nutritional supplement to a patient/resident.

## Properties

| Name                   | Card  | Type            | Description                                                                                                          |
| ---------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| id                     | 0..1  | string          | Logical id of this artifact                                                                                          |
| meta                   | 0..1  | Meta            | Metadata about the resource                                                                                          |
| implicitRules          | 0..1  | uri             | A set of rules under which this content was created                                                                  |
| language               | 0..1  | code            | Language of the resource content                                                                                     |
| text                   | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                               |
| contained              | 0..\* | Resource        | Contained, inline Resources                                                                                          |
| extension              | 0..\* | Extension       | Additional content defined by implementations                                                                        |
| modifierExtension      | 0..\* | Extension       | Extensions that cannot be ignored                                                                                    |
| identifier             | 0..\* | Identifier      | Identifiers assigned to this order                                                                                   |
| instantiatesCanonical  | 0..\* | canonical       | Instantiates FHIR protocol or definition                                                                             |
| instantiatesUri        | 0..\* | uri             | Instantiates external protocol or definition                                                                         |
| instantiates           | 0..\* | uri             | Instantiates protocol or definition                                                                                  |
| status                 | 1..1  | code            | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown                                    |
| intent                 | 1..1  | code            | proposal \| plan \| directive \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option |
| patient                | 1..1  | Reference       | The person who requires the diet, formula or nutritional supplement                                                  |
| encounter              | 0..1  | Reference       | The encounter associated with this nutrition order                                                                   |
| dateTime               | 1..1  | dateTime        | Date and time the nutrition order was requested                                                                      |
| orderer                | 0..1  | Reference       | Who ordered the diet, formula or nutritional supplement                                                              |
| allergyIntolerance     | 0..\* | Reference       | List of the patient's food and nutrition-related allergies and intolerances                                          |
| foodPreferenceModifier | 0..\* | CodeableConcept | Order-specific modifier about the type of food that should be given                                                  |
| excludeFoodModifier    | 0..\* | CodeableConcept | Order-specific modifier about the type of food that should not be given                                              |
| oralDiet               | 0..1  | BackboneElement | Oral diet components                                                                                                 |
| supplement             | 0..\* | BackboneElement | Supplement components                                                                                                |
| enteralFormula         | 0..1  | BackboneElement | Enteral formula components                                                                                           |
| note                   | 0..\* | Annotation      | Comments                                                                                                             |

## Search Parameters

| Name                   | Type      | Description                                                                         | Expression                                    |
| ---------------------- | --------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| identifier             | token     | Return nutrition orders with this external identifier                               | NutritionOrder.identifier                     |
| patient                | reference | The identity of the person who requires the diet, formula or nutritional supplement | NutritionOrder.patient                        |
| encounter              | reference | Return nutrition orders with this encounter identifier                              | NutritionOrder.encounter                      |
| additive               | token     | Type of module component to add to the feeding                                      | NutritionOrder.enteralFormula.additiveType    |
| datetime               | date      | Return nutrition orders requested on this date                                      | NutritionOrder.dateTime                       |
| formula                | token     | Type of enteral or infant formula                                                   | NutritionOrder.enteralFormula.baseFormulaType |
| instantiates-canonical | reference | Instantiates FHIR protocol or definition                                            | NutritionOrder.instantiatesCanonical          |
| instantiates-uri       | uri       | Instantiates external protocol or definition                                        | NutritionOrder.instantiatesUri                |
| oraldiet               | token     | Type of diet that can be consumed orally (i.e., take via the mouth).                | NutritionOrder.oralDiet.type                  |
| provider               | reference | The identity of the provider who placed the nutrition order                         | NutritionOrder.orderer                        |
| status                 | token     | Status of the nutrition order.                                                      | NutritionOrder.status                         |
| supplement             | token     | Type of supplement product requested                                                | NutritionOrder.supplement.type                |
