---
title: Evidence
sidebar_position: 258
---

# Evidence

The Evidence resource describes the conditional state (population and any exposures being compared within the
population) and outcome (if specified) that the knowledge (evidence, assertion, recommendation) is about.

## Properties

| Name               | Card  | Type            | Description                                                                    |
| ------------------ | ----- | --------------- | ------------------------------------------------------------------------------ |
| id                 | 0..1  | string          | Logical id of this artifact                                                    |
| meta               | 0..1  | Meta            | Metadata about the resource                                                    |
| implicitRules      | 0..1  | uri             | A set of rules under which this content was created                            |
| language           | 0..1  | code            | Language of the resource content                                               |
| text               | 0..1  | Narrative       | Text summary of the resource, for human interpretation                         |
| contained          | 0..\* | Resource        | Contained, inline Resources                                                    |
| extension          | 0..\* | Extension       | Additional content defined by implementations                                  |
| modifierExtension  | 0..\* | Extension       | Extensions that cannot be ignored                                              |
| url                | 0..1  | uri             | Canonical identifier for this evidence, represented as a URI (globally unique) |
| identifier         | 0..\* | Identifier      | Additional identifier for the evidence                                         |
| version            | 0..1  | string          | Business version of the evidence                                               |
| name               | 0..1  | string          | Name for this evidence (computer friendly)                                     |
| title              | 0..1  | string          | Name for this evidence (human friendly)                                        |
| shortTitle         | 0..1  | string          | Title for use in informal contexts                                             |
| subtitle           | 0..1  | string          | Subordinate title of the Evidence                                              |
| status             | 1..1  | code            | draft \| active \| retired \| unknown                                          |
| date               | 0..1  | dateTime        | Date last changed                                                              |
| publisher          | 0..1  | string          | Name of the publisher (organization or individual)                             |
| contact            | 0..\* | ContactDetail   | Contact details for the publisher                                              |
| description        | 0..1  | markdown        | Natural language description of the evidence                                   |
| note               | 0..\* | Annotation      | Used for footnotes or explanatory notes                                        |
| useContext         | 0..\* | UsageContext    | The context that the content is intended to support                            |
| jurisdiction       | 0..\* | CodeableConcept | Intended jurisdiction for evidence (if applicable)                             |
| copyright          | 0..1  | markdown        | Use and/or publishing restrictions                                             |
| approvalDate       | 0..1  | date            | When the evidence was approved by publisher                                    |
| lastReviewDate     | 0..1  | date            | When the evidence was last reviewed                                            |
| effectivePeriod    | 0..1  | Period          | When the evidence is expected to be used                                       |
| topic              | 0..\* | CodeableConcept | The category of the Evidence, such as Education, Treatment, Assessment, etc.   |
| author             | 0..\* | ContactDetail   | Who authored the content                                                       |
| editor             | 0..\* | ContactDetail   | Who edited the content                                                         |
| reviewer           | 0..\* | ContactDetail   | Who reviewed the content                                                       |
| endorser           | 0..\* | ContactDetail   | Who endorsed the content                                                       |
| relatedArtifact    | 0..\* | RelatedArtifact | Additional documentation, citations, etc.                                      |
| exposureBackground | 1..1  | Reference       | What population?                                                               |
| exposureVariant    | 0..\* | Reference       | What exposure?                                                                 |
| outcome            | 0..\* | Reference       | What outcome?                                                                  |

## Search Parameters

| Name                  | Type      | Description                                                                    | Expression                |
| --------------------- | --------- | ------------------------------------------------------------------------------ | ------------------------- |
| composed-of           | reference | What resource is being referenced                                              | Evidence.relatedArtifact  |
| context               | token     | A use context assigned to the evidence                                         | Evidence.useContext.value |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the evidence               | Evidence.useContext.value |
| context-type          | token     | A type of use context assigned to the evidence                                 | Evidence.useContext.code  |
| date                  | date      | The evidence publication date                                                  | Evidence.date             |
| depends-on            | reference | What resource is being referenced                                              | Evidence.relatedArtifact  |
| derived-from          | reference | What resource is being referenced                                              | Evidence.relatedArtifact  |
| description           | string    | The description of the evidence                                                | Evidence.description      |
| effective             | date      | The time during which the evidence is intended to be in use                    | Evidence.effectivePeriod  |
| identifier            | token     | External identifier for the evidence                                           | Evidence.identifier       |
| jurisdiction          | token     | Intended jurisdiction for the evidence                                         | Evidence.jurisdiction     |
| name                  | string    | Computationally friendly name of the evidence                                  | Evidence.name             |
| predecessor           | reference | What resource is being referenced                                              | Evidence.relatedArtifact  |
| publisher             | string    | Name of the publisher of the evidence                                          | Evidence.publisher        |
| status                | token     | The current status of the evidence                                             | Evidence.status           |
| successor             | reference | What resource is being referenced                                              | Evidence.relatedArtifact  |
| title                 | string    | The human-friendly name of the evidence                                        | Evidence.title            |
| topic                 | token     | Topics associated with the Evidence                                            | Evidence.topic            |
| url                   | uri       | The uri that identifies the evidence                                           | Evidence.url              |
| version               | token     | The business version of the evidence                                           | Evidence.version          |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the evidence | Evidence.useContext       |
| context-type-value    | composite | A use context type and value assigned to the evidence                          | Evidence.useContext       |
