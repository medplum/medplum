---
title: Questionnaire
sidebar_position: 502
---

# Questionnaire

A structured set of questions intended to guide the collection of answers from end-users. Questionnaires provide
detailed control over order, presentation, phraseology and grouping to allow coherent, consistent data collection.

## Properties

| Name              | Card  | Type            | Description                                                                         |
| ----------------- | ----- | --------------- | ----------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                         |
| meta              | 0..1  | Meta            | Metadata about the resource                                                         |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                 |
| language          | 0..1  | code            | Language of the resource content                                                    |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                              |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                         |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                       |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                   |
| url               | 0..1  | uri             | Canonical identifier for this questionnaire, represented as a URI (globally unique) |
| identifier        | 0..\* | Identifier      | Additional identifier for the questionnaire                                         |
| version           | 0..1  | string          | Business version of the questionnaire                                               |
| name              | 0..1  | string          | Name for this questionnaire (computer friendly)                                     |
| title             | 0..1  | string          | Name for this questionnaire (human friendly)                                        |
| derivedFrom       | 0..\* | canonical       | Instantiates protocol or definition                                                 |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                               |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                                |
| subjectType       | 0..\* | code            | Resource that can be subject of QuestionnaireResponse                               |
| date              | 0..1  | dateTime        | Date last changed                                                                   |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                  |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                   |
| description       | 0..1  | markdown        | Natural language description of the questionnaire                                   |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                 |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for questionnaire (if applicable)                             |
| purpose           | 0..1  | markdown        | Why this questionnaire is defined                                                   |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                                  |
| approvalDate      | 0..1  | date            | When the questionnaire was approved by publisher                                    |
| lastReviewDate    | 0..1  | date            | When the questionnaire was last reviewed                                            |
| effectivePeriod   | 0..1  | Period          | When the questionnaire is expected to be used                                       |
| code              | 0..\* | Coding          | Concept that represents the overall questionnaire                                   |
| item              | 0..\* | BackboneElement | Questions and sections within the Questionnaire                                     |

## Search Parameters

| Name                  | Type      | Description                                                                         | Expression                     |
| --------------------- | --------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| code                  | token     | A code that corresponds to one of its items in the questionnaire                    | Questionnaire.item.code        |
| context               | token     | A use context assigned to the questionnaire                                         | Questionnaire.useContext.value |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the questionnaire               | Questionnaire.useContext.value |
| context-type          | token     | A type of use context assigned to the questionnaire                                 | Questionnaire.useContext.code  |
| date                  | date      | The questionnaire publication date                                                  | Questionnaire.date             |
| definition            | uri       | ElementDefinition - details for the item                                            | Questionnaire.item.definition  |
| description           | string    | The description of the questionnaire                                                | Questionnaire.description      |
| effective             | date      | The time during which the questionnaire is intended to be in use                    | Questionnaire.effectivePeriod  |
| identifier            | token     | External identifier for the questionnaire                                           | Questionnaire.identifier       |
| jurisdiction          | token     | Intended jurisdiction for the questionnaire                                         | Questionnaire.jurisdiction     |
| name                  | string    | Computationally friendly name of the questionnaire                                  | Questionnaire.name             |
| publisher             | string    | Name of the publisher of the questionnaire                                          | Questionnaire.publisher        |
| status                | token     | The current status of the questionnaire                                             | Questionnaire.status           |
| subject-type          | token     | Resource that can be subject of QuestionnaireResponse                               | Questionnaire.subjectType      |
| title                 | string    | The human-friendly name of the questionnaire                                        | Questionnaire.title            |
| url                   | uri       | The uri that identifies the questionnaire                                           | Questionnaire.url              |
| version               | token     | The business version of the questionnaire                                           | Questionnaire.version          |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the questionnaire | Questionnaire.useContext       |
| context-type-value    | composite | A use context type and value assigned to the questionnaire                          | Questionnaire.useContext       |
