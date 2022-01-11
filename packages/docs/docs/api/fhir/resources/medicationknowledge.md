---
title: MedicationKnowledge
sidebar_position: 378
---

# MedicationKnowledge

Information about a medication that is used to support knowledge.

## Properties

| Name                       | Card  | Type            | Description                                                                                              |
| -------------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------- |
| id                         | 0..1  | string          | Logical id of this artifact                                                                              |
| meta                       | 0..1  | Meta            | Metadata about the resource                                                                              |
| implicitRules              | 0..1  | uri             | A set of rules under which this content was created                                                      |
| language                   | 0..1  | code            | Language of the resource content                                                                         |
| text                       | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                   |
| contained                  | 0..\* | Resource        | Contained, inline Resources                                                                              |
| extension                  | 0..\* | Extension       | Additional content defined by implementations                                                            |
| modifierExtension          | 0..\* | Extension       | Extensions that cannot be ignored                                                                        |
| code                       | 0..1  | CodeableConcept | Code that identifies this medication                                                                     |
| status                     | 0..1  | code            | active \| inactive \| entered-in-error                                                                   |
| manufacturer               | 0..1  | Reference       | Manufacturer of the item                                                                                 |
| doseForm                   | 0..1  | CodeableConcept | powder \| tablets \| capsule +                                                                           |
| amount                     | 0..1  | Quantity        | Amount of drug in package                                                                                |
| synonym                    | 0..\* | string          | Additional names for a medication                                                                        |
| relatedMedicationKnowledge | 0..\* | BackboneElement | Associated or related medication information                                                             |
| associatedMedication       | 0..\* | Reference       | A medication resource that is associated with this medication                                            |
| productType                | 0..\* | CodeableConcept | Category of the medication or product                                                                    |
| monograph                  | 0..\* | BackboneElement | Associated documentation about the medication                                                            |
| ingredient                 | 0..\* | BackboneElement | Active or inactive ingredient                                                                            |
| preparationInstruction     | 0..1  | markdown        | The instructions for preparing the medication                                                            |
| intendedRoute              | 0..\* | CodeableConcept | The intended or approved route of administration                                                         |
| cost                       | 0..\* | BackboneElement | The pricing of the medication                                                                            |
| monitoringProgram          | 0..\* | BackboneElement | Program under which a medication is reviewed                                                             |
| administrationGuidelines   | 0..\* | BackboneElement | Guidelines for administration of the medication                                                          |
| medicineClassification     | 0..\* | BackboneElement | Categorization of the medication within a formulary or classification system                             |
| packaging                  | 0..1  | BackboneElement | Details about packaged medications                                                                       |
| drugCharacteristic         | 0..\* | BackboneElement | Specifies descriptive properties of the medicine                                                         |
| contraindication           | 0..\* | Reference       | Potential clinical issue with or between medication(s)                                                   |
| regulatory                 | 0..\* | BackboneElement | Regulatory information about a medication                                                                |
| kinetics                   | 0..\* | BackboneElement | The time course of drug absorption, distribution, metabolism and excretion of a medication from the body |

## Search Parameters

| Name                    | Type      | Description                                                                                                       | Expression                                                |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| classification          | token     | Specific category assigned to the medication                                                                      | MedicationKnowledge.medicineClassification.classification |
| classification-type     | token     | The type of category for the medication (for example, therapeutic classification, therapeutic sub-classification) | MedicationKnowledge.medicineClassification.type           |
| code                    | token     | Code that identifies this medication                                                                              | MedicationKnowledge.code                                  |
| doseform                | token     | powder \| tablets \| capsule +                                                                                    | MedicationKnowledge.doseForm                              |
| ingredient              | reference | Medication(s) or substance(s) contained in the medication                                                         | MedicationKnowledge.ingredient.item                       |
| ingredient-code         | token     | Medication(s) or substance(s) contained in the medication                                                         | MedicationKnowledge.ingredient.item                       |
| manufacturer            | reference | Manufacturer of the item                                                                                          | MedicationKnowledge.manufacturer                          |
| monitoring-program-name | token     | Name of the reviewing program                                                                                     | MedicationKnowledge.monitoringProgram.name                |
| monitoring-program-type | token     | Type of program under which the medication is monitored                                                           | MedicationKnowledge.monitoringProgram.type                |
| monograph               | reference | Associated documentation about the medication                                                                     | MedicationKnowledge.monograph.source                      |
| monograph-type          | token     | The category of medication document                                                                               | MedicationKnowledge.monograph.type                        |
| source-cost             | token     | The source or owner for the price information                                                                     | MedicationKnowledge.cost.source                           |
| status                  | token     | active \| inactive \| entered-in-error                                                                            | MedicationKnowledge.status                                |
