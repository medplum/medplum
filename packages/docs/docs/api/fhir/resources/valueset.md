---
title: ValueSet
sidebar_position: 646
---

# ValueSet

A ValueSet resource instance specifies a set of codes drawn from one or more code systems, intended for use in a
particular context. Value sets link between [[[CodeSystem]]] definitions and their use in [coded
elements](https://www.hl7.org/fhir/terminologies.html).

## Properties

| Name              | Card  | Type            | Description                                                                     |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                     |
| meta              | 0..1  | Meta            | Metadata about the resource                                                     |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                             |
| language          | 0..1  | code            | Language of the resource content                                                |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                          |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                     |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                   |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                               |
| url               | 0..1  | uri             | Canonical identifier for this value set, represented as a URI (globally unique) |
| identifier        | 0..\* | Identifier      | Additional identifier for the value set (business identifier)                   |
| version           | 0..1  | string          | Business version of the value set                                               |
| name              | 0..1  | string          | Name for this value set (computer friendly)                                     |
| title             | 0..1  | string          | Name for this value set (human friendly)                                        |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                           |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                            |
| date              | 0..1  | dateTime        | Date last changed                                                               |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                              |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                               |
| description       | 0..1  | markdown        | Natural language description of the value set                                   |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                             |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for value set (if applicable)                             |
| immutable         | 0..1  | boolean         | Indicates whether or not any change to the content logical definition may occur |
| purpose           | 0..1  | markdown        | Why this value set is defined                                                   |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                              |
| compose           | 0..1  | BackboneElement | Content logical definition of the value set (CLD)                               |
| expansion         | 0..1  | BackboneElement | Used when the value set is "expanded"                                           |

## Search Parameters

| Name                  | Type      | Description                                                                                               | Expression                       |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| context               | token     | A use context assigned to the value set                                                                   | ValueSet.useContext.value        |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the value set                                         | ValueSet.useContext.value        |
| context-type          | token     | A type of use context assigned to the value set                                                           | ValueSet.useContext.code         |
| date                  | date      | The value set publication date                                                                            | ValueSet.date                    |
| description           | string    | The description of the value set                                                                          | ValueSet.description             |
| jurisdiction          | token     | Intended jurisdiction for the value set                                                                   | ValueSet.jurisdiction            |
| name                  | string    | Computationally friendly name of the value set                                                            | ValueSet.name                    |
| publisher             | string    | Name of the publisher of the value set                                                                    | ValueSet.publisher               |
| status                | token     | The current status of the value set                                                                       | ValueSet.status                  |
| title                 | string    | The human-friendly name of the value set                                                                  | ValueSet.title                   |
| url                   | uri       | The uri that identifies the value set                                                                     | ValueSet.url                     |
| version               | token     | The business version of the value set                                                                     | ValueSet.version                 |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the value set                           | ValueSet.useContext              |
| context-type-value    | composite | A use context type and value assigned to the value set                                                    | ValueSet.useContext              |
| identifier            | token     | External identifier for the value set                                                                     | ValueSet.identifier              |
| code                  | token     | This special parameter searches for codes in the value set. See additional notes on the ValueSet resource | ValueSet.expansion.contains.code |
| expansion             | uri       | Identifies the value set expansion (business identifier)                                                  | ValueSet.expansion.identifier    |
| reference             | uri       | A code system included or excluded in the value set or an imported value set                              | ValueSet.compose.include.system  |
