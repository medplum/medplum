---
title: Library
sidebar_position: 347
---

# Library

The Library resource is a general-purpose container for knowledge asset definitions. It can be used to describe and
expose existing knowledge assets such as logic libraries and information model descriptions, as well as to describe a
collection of knowledge assets.

## Properties

| Name              | Card  | Type                | Description                                                                   |
| ----------------- | ----- | ------------------- | ----------------------------------------------------------------------------- |
| id                | 0..1  | string              | Logical id of this artifact                                                   |
| meta              | 0..1  | Meta                | Metadata about the resource                                                   |
| implicitRules     | 0..1  | uri                 | A set of rules under which this content was created                           |
| language          | 0..1  | code                | Language of the resource content                                              |
| text              | 0..1  | Narrative           | Text summary of the resource, for human interpretation                        |
| contained         | 0..\* | Resource            | Contained, inline Resources                                                   |
| extension         | 0..\* | Extension           | Additional content defined by implementations                                 |
| modifierExtension | 0..\* | Extension           | Extensions that cannot be ignored                                             |
| url               | 0..1  | uri                 | Canonical identifier for this library, represented as a URI (globally unique) |
| identifier        | 0..\* | Identifier          | Additional identifier for the library                                         |
| version           | 0..1  | string              | Business version of the library                                               |
| name              | 0..1  | string              | Name for this library (computer friendly)                                     |
| title             | 0..1  | string              | Name for this library (human friendly)                                        |
| subtitle          | 0..1  | string              | Subordinate title of the library                                              |
| status            | 1..1  | code                | draft \| active \| retired \| unknown                                         |
| experimental      | 0..1  | boolean             | For testing purposes, not real usage                                          |
| type              | 1..1  | CodeableConcept     | logic-library \| model-definition \| asset-collection \| module-definition    |
| subject[x]        | 0..1  | CodeableConcept     | Type of individual the library content is focused on                          |
| date              | 0..1  | dateTime            | Date last changed                                                             |
| publisher         | 0..1  | string              | Name of the publisher (organization or individual)                            |
| contact           | 0..\* | ContactDetail       | Contact details for the publisher                                             |
| description       | 0..1  | markdown            | Natural language description of the library                                   |
| useContext        | 0..\* | UsageContext        | The context that the content is intended to support                           |
| jurisdiction      | 0..\* | CodeableConcept     | Intended jurisdiction for library (if applicable)                             |
| purpose           | 0..1  | markdown            | Why this library is defined                                                   |
| usage             | 0..1  | string              | Describes the clinical usage of the library                                   |
| copyright         | 0..1  | markdown            | Use and/or publishing restrictions                                            |
| approvalDate      | 0..1  | date                | When the library was approved by publisher                                    |
| lastReviewDate    | 0..1  | date                | When the library was last reviewed                                            |
| effectivePeriod   | 0..1  | Period              | When the library is expected to be used                                       |
| topic             | 0..\* | CodeableConcept     | E.g. Education, Treatment, Assessment, etc.                                   |
| author            | 0..\* | ContactDetail       | Who authored the content                                                      |
| editor            | 0..\* | ContactDetail       | Who edited the content                                                        |
| reviewer          | 0..\* | ContactDetail       | Who reviewed the content                                                      |
| endorser          | 0..\* | ContactDetail       | Who endorsed the content                                                      |
| relatedArtifact   | 0..\* | RelatedArtifact     | Additional documentation, citations, etc.                                     |
| parameter         | 0..\* | ParameterDefinition | Parameters defined by the library                                             |
| dataRequirement   | 0..\* | DataRequirement     | What data is referenced by this library                                       |
| content           | 0..\* | Attachment          | Contents of the library, either embedded or referenced                        |

## Search Parameters

| Name                  | Type      | Description                                                                                         | Expression                  |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| composed-of           | reference | What resource is being referenced                                                                   | Library.relatedArtifact     |
| content-type          | token     | The type of content in the library (e.g. text/cql)                                                  | Library.content.contentType |
| context               | token     | A use context assigned to the library                                                               | Library.useContext.value    |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the library                                     | Library.useContext.value    |
| context-type          | token     | A type of use context assigned to the library                                                       | Library.useContext.code     |
| date                  | date      | The library publication date                                                                        | Library.date                |
| depends-on            | reference | What resource is being referenced                                                                   | Library.relatedArtifact     |
| derived-from          | reference | What resource is being referenced                                                                   | Library.relatedArtifact     |
| description           | string    | The description of the library                                                                      | Library.description         |
| effective             | date      | The time during which the library is intended to be in use                                          | Library.effectivePeriod     |
| identifier            | token     | External identifier for the library                                                                 | Library.identifier          |
| jurisdiction          | token     | Intended jurisdiction for the library                                                               | Library.jurisdiction        |
| name                  | string    | Computationally friendly name of the library                                                        | Library.name                |
| predecessor           | reference | What resource is being referenced                                                                   | Library.relatedArtifact     |
| publisher             | string    | Name of the publisher of the library                                                                | Library.publisher           |
| status                | token     | The current status of the library                                                                   | Library.status              |
| successor             | reference | What resource is being referenced                                                                   | Library.relatedArtifact     |
| title                 | string    | The human-friendly name of the library                                                              | Library.title               |
| topic                 | token     | Topics associated with the module                                                                   | Library.topic               |
| type                  | token     | The type of the library (e.g. logic-library, model-definition, asset-collection, module-definition) | Library.type                |
| url                   | uri       | The uri that identifies the library                                                                 | Library.url                 |
| version               | token     | The business version of the library                                                                 | Library.version             |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the library                       | Library.useContext          |
| context-type-value    | composite | A use context type and value assigned to the library                                                | Library.useContext          |
