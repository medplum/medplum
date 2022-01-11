---
title: NamingSystem
sidebar_position: 446
---

# NamingSystem

A curated namespace that issues unique symbols within that namespace for the identification of concepts, people,
devices, etc. Represents a "System" used within the Identifier and Coding data types.

## Properties

| Name              | Card  | Type            | Description                                             |
| ----------------- | ----- | --------------- | ------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                             |
| meta              | 0..1  | Meta            | Metadata about the resource                             |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created     |
| language          | 0..1  | code            | Language of the resource content                        |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation  |
| contained         | 0..\* | Resource        | Contained, inline Resources                             |
| extension         | 0..\* | Extension       | Additional content defined by implementations           |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                       |
| name              | 1..1  | string          | Name for this naming system (computer friendly)         |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                   |
| kind              | 1..1  | code            | codesystem \| identifier \| root                        |
| date              | 1..1  | dateTime        | Date last changed                                       |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)      |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                       |
| responsible       | 0..1  | string          | Who maintains system namespace?                         |
| type              | 0..1  | CodeableConcept | e.g. driver, provider, patient, bank etc.               |
| description       | 0..1  | markdown        | Natural language description of the naming system       |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support     |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for naming system (if applicable) |
| usage             | 0..1  | string          | How/where is it used                                    |
| uniqueId          | 1..\* | BackboneElement | Unique identifiers used for system                      |

## Search Parameters

| Name                  | Type      | Description                                                                         | Expression                    |
| --------------------- | --------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| context               | token     | A use context assigned to the naming system                                         | NamingSystem.useContext.value |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the naming system               | NamingSystem.useContext.value |
| context-type          | token     | A type of use context assigned to the naming system                                 | NamingSystem.useContext.code  |
| date                  | date      | The naming system publication date                                                  | NamingSystem.date             |
| description           | string    | The description of the naming system                                                | NamingSystem.description      |
| jurisdiction          | token     | Intended jurisdiction for the naming system                                         | NamingSystem.jurisdiction     |
| name                  | string    | Computationally friendly name of the naming system                                  | NamingSystem.name             |
| publisher             | string    | Name of the publisher of the naming system                                          | NamingSystem.publisher        |
| status                | token     | The current status of the naming system                                             | NamingSystem.status           |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the naming system | NamingSystem.useContext       |
| context-type-value    | composite | A use context type and value assigned to the naming system                          | NamingSystem.useContext       |
| contact               | string    | Name of an individual to contact                                                    | NamingSystem.contact.name     |
| id-type               | token     | oid \| uuid \| uri \| other                                                         | NamingSystem.uniqueId.type    |
| kind                  | token     | codesystem \| identifier \| root                                                    | NamingSystem.kind             |
| period                | date      | When is identifier valid?                                                           | NamingSystem.uniqueId.period  |
| responsible           | string    | Who maintains system namespace?                                                     | NamingSystem.responsible      |
| telecom               | token     | Contact details for individual or organization                                      | NamingSystem.contact.telecom  |
| type                  | token     | e.g. driver, provider, patient, bank etc.                                           | NamingSystem.type             |
| value                 | string    | The unique identifier                                                               | NamingSystem.uniqueId.value   |
