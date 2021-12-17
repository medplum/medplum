---
title: EvidenceVariable
sidebar_position: 259
---

# EvidenceVariable

The EvidenceVariable resource describes a "PICO" element that knowledge (evidence, assertion, recommendation) is about.

## Properties

| Name              | Card  | Type            | Description                                                                             |
| ----------------- | ----- | --------------- | --------------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                             |
| meta              | 0..1  | Meta            | Metadata about the resource                                                             |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                     |
| language          | 0..1  | code            | Language of the resource content                                                        |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                  |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                             |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                           |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                       |
| url               | 0..1  | uri             | Canonical identifier for this evidence variable, represented as a URI (globally unique) |
| identifier        | 0..\* | Identifier      | Additional identifier for the evidence variable                                         |
| version           | 0..1  | string          | Business version of the evidence variable                                               |
| name              | 0..1  | string          | Name for this evidence variable (computer friendly)                                     |
| title             | 0..1  | string          | Name for this evidence variable (human friendly)                                        |
| shortTitle        | 0..1  | string          | Title for use in informal contexts                                                      |
| subtitle          | 0..1  | string          | Subordinate title of the EvidenceVariable                                               |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                                   |
| date              | 0..1  | dateTime        | Date last changed                                                                       |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                      |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                       |
| description       | 0..1  | markdown        | Natural language description of the evidence variable                                   |
| note              | 0..\* | Annotation      | Used for footnotes or explanatory notes                                                 |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                     |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for evidence variable (if applicable)                             |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                                      |
| approvalDate      | 0..1  | date            | When the evidence variable was approved by publisher                                    |
| lastReviewDate    | 0..1  | date            | When the evidence variable was last reviewed                                            |
| effectivePeriod   | 0..1  | Period          | When the evidence variable is expected to be used                                       |
| topic             | 0..\* | CodeableConcept | The category of the EvidenceVariable, such as Education, Treatment, Assessment, etc.    |
| author            | 0..\* | ContactDetail   | Who authored the content                                                                |
| editor            | 0..\* | ContactDetail   | Who edited the content                                                                  |
| reviewer          | 0..\* | ContactDetail   | Who reviewed the content                                                                |
| endorser          | 0..\* | ContactDetail   | Who endorsed the content                                                                |
| relatedArtifact   | 0..\* | RelatedArtifact | Additional documentation, citations, etc.                                               |
| type              | 0..1  | code            | dichotomous \| continuous \| descriptive                                                |
| characteristic    | 1..\* | BackboneElement | What defines the members of the evidence element                                        |

## Search Parameters

| Name                  | Type      | Description                                                                             | Expression                        |
| --------------------- | --------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| composed-of           | reference | What resource is being referenced                                                       | EvidenceVariable.relatedArtifact  |
| context               | token     | A use context assigned to the evidence variable                                         | EvidenceVariable.useContext.value |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the evidence variable               | EvidenceVariable.useContext.value |
| context-type          | token     | A type of use context assigned to the evidence variable                                 | EvidenceVariable.useContext.code  |
| date                  | date      | The evidence variable publication date                                                  | EvidenceVariable.date             |
| depends-on            | reference | What resource is being referenced                                                       | EvidenceVariable.relatedArtifact  |
| derived-from          | reference | What resource is being referenced                                                       | EvidenceVariable.relatedArtifact  |
| description           | string    | The description of the evidence variable                                                | EvidenceVariable.description      |
| effective             | date      | The time during which the evidence variable is intended to be in use                    | EvidenceVariable.effectivePeriod  |
| identifier            | token     | External identifier for the evidence variable                                           | EvidenceVariable.identifier       |
| jurisdiction          | token     | Intended jurisdiction for the evidence variable                                         | EvidenceVariable.jurisdiction     |
| name                  | string    | Computationally friendly name of the evidence variable                                  | EvidenceVariable.name             |
| predecessor           | reference | What resource is being referenced                                                       | EvidenceVariable.relatedArtifact  |
| publisher             | string    | Name of the publisher of the evidence variable                                          | EvidenceVariable.publisher        |
| status                | token     | The current status of the evidence variable                                             | EvidenceVariable.status           |
| successor             | reference | What resource is being referenced                                                       | EvidenceVariable.relatedArtifact  |
| title                 | string    | The human-friendly name of the evidence variable                                        | EvidenceVariable.title            |
| topic                 | token     | Topics associated with the EvidenceVariable                                             | EvidenceVariable.topic            |
| url                   | uri       | The uri that identifies the evidence variable                                           | EvidenceVariable.url              |
| version               | token     | The business version of the evidence variable                                           | EvidenceVariable.version          |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the evidence variable | EvidenceVariable.useContext       |
| context-type-value    | composite | A use context type and value assigned to the evidence variable                          | EvidenceVariable.useContext       |
