---
title: CodeSystem
sidebar_position: 146
---

# CodeSystem

The CodeSystem resource is used to declare the existence of and describe a code system or code system supplement and its
key properties, and optionally define a part or all of its content.

## Properties

| Name              | Card  | Type            | Description                                                                                       |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                                       |
| meta              | 0..1  | Meta            | Metadata about the resource                                                                       |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                               |
| language          | 0..1  | code            | Language of the resource content                                                                  |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                            |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                                       |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                                     |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                                 |
| url               | 0..1  | uri             | Canonical identifier for this code system, represented as a URI (globally unique) (Coding.system) |
| identifier        | 0..\* | Identifier      | Additional identifier for the code system (business identifier)                                   |
| version           | 0..1  | string          | Business version of the code system (Coding.version)                                              |
| name              | 0..1  | string          | Name for this code system (computer friendly)                                                     |
| title             | 0..1  | string          | Name for this code system (human friendly)                                                        |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                                             |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                                              |
| date              | 0..1  | dateTime        | Date last changed                                                                                 |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                                |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                                 |
| description       | 0..1  | markdown        | Natural language description of the code system                                                   |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                               |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for code system (if applicable)                                             |
| purpose           | 0..1  | markdown        | Why this code system is defined                                                                   |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                                                |
| caseSensitive     | 0..1  | boolean         | If code comparison is case sensitive                                                              |
| valueSet          | 0..1  | canonical       | Canonical reference to the value set with entire code system                                      |
| hierarchyMeaning  | 0..1  | code            | grouped-by \| is-a \| part-of \| classified-with                                                  |
| compositional     | 0..1  | boolean         | If code system defines a compositional grammar                                                    |
| versionNeeded     | 0..1  | boolean         | If definitions are not stable                                                                     |
| content           | 1..1  | code            | not-present \| example \| fragment \| complete \| supplement                                      |
| supplements       | 0..1  | canonical       | Canonical URL of Code System this adds designations and properties to                             |
| count             | 0..1  | unsignedInt     | Total concepts in the code system                                                                 |
| filter            | 0..\* | BackboneElement | Filter that can be used in a value set                                                            |
| property          | 0..\* | BackboneElement | Additional information supplied about each concept                                                |
| concept           | 0..\* | BackboneElement | Concepts in the code system                                                                       |

## Search Parameters

| Name                  | Type      | Description                                                                       | Expression                              |
| --------------------- | --------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| context               | token     | A use context assigned to the code system                                         | CodeSystem.useContext.value             |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the code system               | CodeSystem.useContext.value             |
| context-type          | token     | A type of use context assigned to the code system                                 | CodeSystem.useContext.code              |
| date                  | date      | The code system publication date                                                  | CodeSystem.date                         |
| description           | string    | The description of the code system                                                | CodeSystem.description                  |
| jurisdiction          | token     | Intended jurisdiction for the code system                                         | CodeSystem.jurisdiction                 |
| name                  | string    | Computationally friendly name of the code system                                  | CodeSystem.name                         |
| publisher             | string    | Name of the publisher of the code system                                          | CodeSystem.publisher                    |
| status                | token     | The current status of the code system                                             | CodeSystem.status                       |
| title                 | string    | The human-friendly name of the code system                                        | CodeSystem.title                        |
| url                   | uri       | The uri that identifies the code system                                           | CodeSystem.url                          |
| version               | token     | The business version of the code system                                           | CodeSystem.version                      |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the code system | CodeSystem.useContext                   |
| context-type-value    | composite | A use context type and value assigned to the code system                          | CodeSystem.useContext                   |
| code                  | token     | A code defined in the code system                                                 | CodeSystem.concept.code                 |
| content-mode          | token     | not-present \| example \| fragment \| complete \| supplement                      | CodeSystem.content                      |
| identifier            | token     | External identifier for the code system                                           | CodeSystem.identifier                   |
| language              | token     | A language in which a designation is provided                                     | CodeSystem.concept.designation.language |
| supplements           | reference | Find code system supplements for the referenced code system                       | CodeSystem.supplements                  |
| system                | uri       | The system for any codes defined by this code system (same as 'url')              | CodeSystem.url                          |
