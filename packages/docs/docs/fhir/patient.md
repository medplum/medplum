---
title: Patient
sidebar_position: 473
---

# Patient

Demographics and other administrative information about an individual or animal receiving care or other health-related services.

## Properties

| Name                 | Card  | Type            | Description                                                                          |
| -------------------- | ----- | --------------- | ------------------------------------------------------------------------------------ |
| id                   | 0..1  | string          | Logical id of this artifact                                                          |
| meta                 | 0..1  | Meta            | Metadata about the resource                                                          |
| implicitRules        | 0..1  | uri             | A set of rules under which this content was created                                  |
| language             | 0..1  | code            | Language of the resource content                                                     |
| text                 | 0..1  | Narrative       | Text summary of the resource, for human interpretation                               |
| contained            | 0..\* | Resource        | Contained, inline Resources                                                          |
| extension            | 0..\* | Extension       | Additional content defined by implementations                                        |
| modifierExtension    | 0..\* | Extension       | Extensions that cannot be ignored                                                    |
| identifier           | 0..\* | Identifier      | An identifier for this patient                                                       |
| active               | 0..1  | boolean         | Whether this patient's record is in active use                                       |
| name                 | 0..\* | HumanName       | A name associated with the patient                                                   |
| telecom              | 0..\* | ContactPoint    | A contact detail for the individual                                                  |
| gender               | 0..1  | code            | male \| female \| other \| unknown                                                   |
| birthDate            | 0..1  | date            | The date of birth for the individual                                                 |
| deceased[x]          | 0..1  | boolean         | Indicates if the individual is deceased or not                                       |
| address              | 0..\* | Address         | An address for the individual                                                        |
| maritalStatus        | 0..1  | CodeableConcept | Marital (civil) status of a patient                                                  |
| multipleBirth[x]     | 0..1  | boolean         | Whether patient is part of a multiple birth                                          |
| photo                | 0..\* | Attachment      | Image of the patient                                                                 |
| contact              | 0..\* | BackboneElement | A contact party (e.g. guardian, partner, friend) for the patient                     |
| communication        | 0..\* | BackboneElement | A language which may be used to communicate with the patient about his or her health |
| generalPractitioner  | 0..\* | Reference       | Patient's nominated primary care provider                                            |
| managingOrganization | 0..1  | Reference       | Organization that is the custodian of the patient record                             |
| link                 | 0..\* | BackboneElement | Link to another patient resource that concerns the same actual person                |

## Search Parameters

| Name                 | Type      | Description                                                                                                                                             | Expression                                              |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| active               | token     | Whether the patient record is active                                                                                                                    | Patient.active                                          |
| address              | string    | A server defined search that may match any of the string fields in the Address, including line, city, district, state, country, postalCode, and/or text | Patient.address                                         |
| address-city         | string    | A city specified in an address                                                                                                                          | Patient.address.city                                    |
| address-country      | string    | A country specified in an address                                                                                                                       | Patient.address.country                                 |
| address-postalcode   | string    | A postalCode specified in an address                                                                                                                    | Patient.address.postalCode                              |
| address-state        | string    | A state specified in an address                                                                                                                         | Patient.address.state                                   |
| address-use          | token     | A use code specified in an address                                                                                                                      | Patient.address.use                                     |
| birthdate            | date      | The patient's date of birth                                                                                                                             | Patient.birthDate                                       |
| death-date           | date      | The date of death has been provided and satisfies this search value                                                                                     | Patient.deceased                                        |
| deceased             | token     | This patient has been marked as deceased, or as a death date entered                                                                                    | Patient.deceased.exists() and Patient.deceased != false |
| email                | token     | A value in an email contact                                                                                                                             | Patient.telecom                                         |
| family               | string    | A portion of the family name of the patient                                                                                                             | Patient.name.family                                     |
| gender               | token     | Gender of the patient                                                                                                                                   | Patient.gender                                          |
| general-practitioner | reference | Patient's nominated general practitioner, not the organization that manages the record                                                                  | Patient.generalPractitioner                             |
| given                | string    | A portion of the given name of the patient                                                                                                              | Patient.name.given                                      |
| identifier           | token     | A patient identifier                                                                                                                                    | Patient.identifier                                      |
| language             | token     | Language code (irrespective of use value)                                                                                                               | Patient.communication.language                          |
| link                 | reference | All patients linked to the given patient                                                                                                                | Patient.link.other                                      |
| name                 | string    | A server defined search that may match any of the string fields in the HumanName, including family, give, prefix, suffix, suffix, and/or text           | Patient.name                                            |
| organization         | reference | The organization that is the custodian of the patient record                                                                                            | Patient.managingOrganization                            |
| phone                | token     | A value in a phone contact                                                                                                                              | Patient.telecom                                         |
| phonetic             | string    | A portion of either family or given name using some kind of phonetic matching algorithm                                                                 | Patient.name                                            |
| telecom              | token     | The value in any kind of telecom details of the patient                                                                                                 | Patient.telecom                                         |
