---
title: Medication
sidebar_position: 369
---

# Medication

This resource is primarily used for the identification and definition of a medication for the purposes of prescribing,
dispensing, and administering a medication as well as for making statements about medication use.

## Properties

| Name              | Card  | Type            | Description                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                            |
| meta              | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created    |
| language          | 0..1  | code            | Language of the resource content                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource        | Contained, inline Resources                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                      |
| identifier        | 0..\* | Identifier      | Business identifier for this medication                |
| code              | 0..1  | CodeableConcept | Codes that identify this medication                    |
| status            | 0..1  | code            | active \| inactive \| entered-in-error                 |
| manufacturer      | 0..1  | Reference       | Manufacturer of the item                               |
| form              | 0..1  | CodeableConcept | powder \| tablets \| capsule +                         |
| amount            | 0..1  | Ratio           | Amount of drug in package                              |
| ingredient        | 0..\* | BackboneElement | Active or inactive ingredient                          |
| batch             | 0..1  | BackboneElement | Details about packaged medications                     |

## Search Parameters

| Name            | Type      | Description                                              | Expression                      |
| --------------- | --------- | -------------------------------------------------------- | ------------------------------- |
| code            | token     | Returns medications for a specific code                  | Medication.code                 |
| expiration-date | date      | Returns medications in a batch with this expiration date | Medication.batch.expirationDate |
| form            | token     | Returns medications for a specific dose form             | Medication.form                 |
| identifier      | token     | Returns medications with this external identifier        | Medication.identifier           |
| ingredient      | reference | Returns medications for this ingredient reference        | Medication.ingredient.item      |
| ingredient-code | token     | Returns medications for this ingredient code             | Medication.ingredient.item      |
| lot-number      | token     | Returns medications in a batch with this lot number      | Medication.batch.lotNumber      |
| manufacturer    | reference | Returns medications made or sold for this manufacturer   | Medication.manufacturer         |
| status          | token     | Returns medications for this status                      | Medication.status               |
