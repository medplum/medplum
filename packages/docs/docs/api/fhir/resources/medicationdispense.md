---
title: MedicationDispense
sidebar_position: 375
---

# MedicationDispense

Indicates that a medication product is to be or has been dispensed for a named person/patient. This includes a
description of the medication product (supply) provided and the instructions for administering the medication. The
medication dispense is the result of a pharmacy system responding to a medication order.

## Properties

| Name                    | Card  | Type            | Description                                                                                                           |
| ----------------------- | ----- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| id                      | 0..1  | string          | Logical id of this artifact                                                                                           |
| meta                    | 0..1  | Meta            | Metadata about the resource                                                                                           |
| implicitRules           | 0..1  | uri             | A set of rules under which this content was created                                                                   |
| language                | 0..1  | code            | Language of the resource content                                                                                      |
| text                    | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                                |
| contained               | 0..\* | Resource        | Contained, inline Resources                                                                                           |
| extension               | 0..\* | Extension       | Additional content defined by implementations                                                                         |
| modifierExtension       | 0..\* | Extension       | Extensions that cannot be ignored                                                                                     |
| identifier              | 0..\* | Identifier      | External identifier                                                                                                   |
| partOf                  | 0..\* | Reference       | Event that dispense is part of                                                                                        |
| status                  | 1..1  | code            | preparation \| in-progress \| cancelled \| on-hold \| completed \| entered-in-error \| stopped \| declined \| unknown |
| statusReason[x]         | 0..1  | CodeableConcept | Why a dispense was not performed                                                                                      |
| category                | 0..1  | CodeableConcept | Type of medication dispense                                                                                           |
| medication[x]           | 1..1  | CodeableConcept | What medication was supplied                                                                                          |
| subject                 | 0..1  | Reference       | Who the dispense is for                                                                                               |
| context                 | 0..1  | Reference       | Encounter / Episode associated with event                                                                             |
| supportingInformation   | 0..\* | Reference       | Information that supports the dispensing of the medication                                                            |
| performer               | 0..\* | BackboneElement | Who performed event                                                                                                   |
| location                | 0..1  | Reference       | Where the dispense occurred                                                                                           |
| authorizingPrescription | 0..\* | Reference       | Medication order that authorizes the dispense                                                                         |
| type                    | 0..1  | CodeableConcept | Trial fill, partial fill, emergency fill, etc.                                                                        |
| quantity                | 0..1  | Quantity        | Amount dispensed                                                                                                      |
| daysSupply              | 0..1  | Quantity        | Amount of medication expressed as a timing amount                                                                     |
| whenPrepared            | 0..1  | dateTime        | When product was packaged and reviewed                                                                                |
| whenHandedOver          | 0..1  | dateTime        | When product was given out                                                                                            |
| destination             | 0..1  | Reference       | Where the medication was sent                                                                                         |
| receiver                | 0..\* | Reference       | Who collected the medication                                                                                          |
| note                    | 0..\* | Annotation      | Information about the dispense                                                                                        |
| dosageInstruction       | 0..\* | Dosage          | How the medication is to be used by the patient or administered by the caregiver                                      |
| substitution            | 0..1  | BackboneElement | Whether a substitution was performed on the dispense                                                                  |
| detectedIssue           | 0..\* | Reference       | Clinical issue with action                                                                                            |
| eventHistory            | 0..\* | Reference       | A list of relevant lifecycle events                                                                                   |

## Search Parameters

| Name             | Type      | Description                                                            | Expression                                       |
| ---------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| code             | token     | Returns dispenses of this medicine code                                | MedicationDispense.medication                    |
| identifier       | token     | Returns dispenses with this external identifier                        | MedicationDispense.identifier                    |
| patient          | reference | The identity of a patient to list dispenses for                        | MedicationDispense.subject                       |
| medication       | reference | Returns dispenses of this medicine resource                            | MedicationDispense.medication                    |
| status           | token     | Returns dispenses with a specified dispense status                     | MedicationDispense.status                        |
| context          | reference | Returns dispenses with a specific context (episode or episode of care) | MedicationDispense.context                       |
| destination      | reference | Returns dispenses that should be sent to a specific destination        | MedicationDispense.destination                   |
| performer        | reference | Returns dispenses performed by a specific individual                   | MedicationDispense.performer.actor               |
| prescription     | reference | The identity of a prescription to list dispenses from                  | MedicationDispense.authorizingPrescription       |
| receiver         | reference | The identity of a receiver to list dispenses for                       | MedicationDispense.receiver                      |
| responsibleparty | reference | Returns dispenses with the specified responsible party                 | MedicationDispense.substitution.responsibleParty |
| subject          | reference | The identity of a patient for whom to list dispenses                   | MedicationDispense.subject                       |
| type             | token     | Returns dispenses of a specific type                                   | MedicationDispense.type                          |
| whenhandedover   | date      | Returns dispenses handed over on this date                             | MedicationDispense.whenHandedOver                |
| whenprepared     | date      | Returns dispenses prepared on this date                                | MedicationDispense.whenPrepared                  |
