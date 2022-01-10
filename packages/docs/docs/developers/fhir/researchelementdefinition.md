---
title: ResearchElementDefinition
sidebar_position: 517
---

# ResearchElementDefinition

The ResearchElementDefinition resource describes a "PICO" element that knowledge (evidence, assertion, recommendation) is about.

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
| url               | 0..1  | uri             | Canonical identifier for this research element definition, represented as a URI (globally unique) |
| identifier        | 0..\* | Identifier      | Additional identifier for the research element definition                                         |
| version           | 0..1  | string          | Business version of the research element definition                                               |
| name              | 0..1  | string          | Name for this research element definition (computer friendly)                                     |
| title             | 0..1  | string          | Name for this research element definition (human friendly)                                        |
| shortTitle        | 0..1  | string          | Title for use in informal contexts                                                                |
| subtitle          | 0..1  | string          | Subordinate title of the ResearchElementDefinition                                                |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                                             |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                                              |
| subject[x]        | 0..1  | CodeableConcept | E.g. Patient, Practitioner, RelatedPerson, Organization, Location, Device                         |
| date              | 0..1  | dateTime        | Date last changed                                                                                 |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                                |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                                 |
| description       | 0..1  | markdown        | Natural language description of the research element definition                                   |
| comment           | 0..\* | string          | Used for footnotes or explanatory notes                                                           |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                               |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for research element definition (if applicable)                             |
| purpose           | 0..1  | markdown        | Why this research element definition is defined                                                   |
| usage             | 0..1  | string          | Describes the clinical usage of the ResearchElementDefinition                                     |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                                                |
| approvalDate      | 0..1  | date            | When the research element definition was approved by publisher                                    |
| lastReviewDate    | 0..1  | date            | When the research element definition was last reviewed                                            |
| effectivePeriod   | 0..1  | Period          | When the research element definition is expected to be used                                       |
| topic             | 0..\* | CodeableConcept | The category of the ResearchElementDefinition, such as Education, Treatment, Assessment, etc.     |
| author            | 0..\* | ContactDetail   | Who authored the content                                                                          |
| editor            | 0..\* | ContactDetail   | Who edited the content                                                                            |
| reviewer          | 0..\* | ContactDetail   | Who reviewed the content                                                                          |
| endorser          | 0..\* | ContactDetail   | Who endorsed the content                                                                          |
| relatedArtifact   | 0..\* | RelatedArtifact | Additional documentation, citations, etc.                                                         |
| library           | 0..\* | canonical       | Logic used by the ResearchElementDefinition                                                       |
| type              | 1..1  | code            | population \| exposure \| outcome                                                                 |
| variableType      | 0..1  | code            | dichotomous \| continuous \| descriptive                                                          |
| characteristic    | 1..\* | BackboneElement | What defines the members of the research element                                                  |

## Search Parameters

| Name                  | Type      | Description                                                                                       | Expression                                 |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| composed-of           | reference | What resource is being referenced                                                                 | ResearchElementDefinition.relatedArtifact  |
| context               | token     | A use context assigned to the research element definition                                         | ResearchElementDefinition.useContext.value |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the research element definition               | ResearchElementDefinition.useContext.value |
| context-type          | token     | A type of use context assigned to the research element definition                                 | ResearchElementDefinition.useContext.code  |
| date                  | date      | The research element definition publication date                                                  | ResearchElementDefinition.date             |
| depends-on            | reference | What resource is being referenced                                                                 | ResearchElementDefinition.relatedArtifact  |
| derived-from          | reference | What resource is being referenced                                                                 | ResearchElementDefinition.relatedArtifact  |
| description           | string    | The description of the research element definition                                                | ResearchElementDefinition.description      |
| effective             | date      | The time during which the research element definition is intended to be in use                    | ResearchElementDefinition.effectivePeriod  |
| identifier            | token     | External identifier for the research element definition                                           | ResearchElementDefinition.identifier       |
| jurisdiction          | token     | Intended jurisdiction for the research element definition                                         | ResearchElementDefinition.jurisdiction     |
| name                  | string    | Computationally friendly name of the research element definition                                  | ResearchElementDefinition.name             |
| predecessor           | reference | What resource is being referenced                                                                 | ResearchElementDefinition.relatedArtifact  |
| publisher             | string    | Name of the publisher of the research element definition                                          | ResearchElementDefinition.publisher        |
| status                | token     | The current status of the research element definition                                             | ResearchElementDefinition.status           |
| successor             | reference | What resource is being referenced                                                                 | ResearchElementDefinition.relatedArtifact  |
| title                 | string    | The human-friendly name of the research element definition                                        | ResearchElementDefinition.title            |
| topic                 | token     | Topics associated with the ResearchElementDefinition                                              | ResearchElementDefinition.topic            |
| url                   | uri       | The uri that identifies the research element definition                                           | ResearchElementDefinition.url              |
| version               | token     | The business version of the research element definition                                           | ResearchElementDefinition.version          |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the research element definition | ResearchElementDefinition.useContext       |
| context-type-value    | composite | A use context type and value assigned to the research element definition                          | ResearchElementDefinition.useContext       |
