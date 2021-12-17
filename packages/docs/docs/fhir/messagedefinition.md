---
title: MessageDefinition
sidebar_position: 430
---

# MessageDefinition

Defines the characteristics of a message that can be shared between systems, including the type of event that initiates
the message, the content to be transmitted and what response(s), if any, are permitted.

## Properties

| Name              | Card  | Type            | Description                                                  |
| ----------------- | ----- | --------------- | ------------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                                  |
| meta              | 0..1  | Meta            | Metadata about the resource                                  |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created          |
| language          | 0..1  | code            | Language of the resource content                             |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation       |
| contained         | 0..\* | Resource        | Contained, inline Resources                                  |
| extension         | 0..\* | Extension       | Additional content defined by implementations                |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                            |
| url               | 0..1  | uri             | Business Identifier for a given MessageDefinition            |
| identifier        | 0..\* | Identifier      | Primary key for the message definition on a given server     |
| version           | 0..1  | string          | Business version of the message definition                   |
| name              | 0..1  | string          | Name for this message definition (computer friendly)         |
| title             | 0..1  | string          | Name for this message definition (human friendly)            |
| replaces          | 0..\* | canonical       | Takes the place of                                           |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                        |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                         |
| date              | 1..1  | dateTime        | Date last changed                                            |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)           |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                            |
| description       | 0..1  | markdown        | Natural language description of the message definition       |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support          |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for message definition (if applicable) |
| purpose           | 0..1  | markdown        | Why this message definition is defined                       |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                           |
| base              | 0..1  | canonical       | Definition this one is based on                              |
| parent            | 0..\* | canonical       | Protocol/workflow this is part of                            |
| event[x]          | 1..1  | Coding          | Event code or link to the EventDefinition                    |
| category          | 0..1  | code            | consequence \| currency \| notification                      |
| focus             | 0..\* | BackboneElement | Resource(s) that are the subject of the event                |
| responseRequired  | 0..1  | code            | always \| on-error \| never \| on-success                    |
| allowedResponse   | 0..\* | BackboneElement | Responses to this message                                    |
| graph             | 0..\* | canonical       | Canonical reference to a GraphDefinition                     |

## Search Parameters

| Name                  | Type      | Description                                                                              | Expression                         |
| --------------------- | --------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| context               | token     | A use context assigned to the message definition                                         | MessageDefinition.useContext.value |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the message definition               | MessageDefinition.useContext.value |
| context-type          | token     | A type of use context assigned to the message definition                                 | MessageDefinition.useContext.code  |
| date                  | date      | The message definition publication date                                                  | MessageDefinition.date             |
| description           | string    | The description of the message definition                                                | MessageDefinition.description      |
| jurisdiction          | token     | Intended jurisdiction for the message definition                                         | MessageDefinition.jurisdiction     |
| name                  | string    | Computationally friendly name of the message definition                                  | MessageDefinition.name             |
| publisher             | string    | Name of the publisher of the message definition                                          | MessageDefinition.publisher        |
| status                | token     | The current status of the message definition                                             | MessageDefinition.status           |
| title                 | string    | The human-friendly name of the message definition                                        | MessageDefinition.title            |
| url                   | uri       | The uri that identifies the message definition                                           | MessageDefinition.url              |
| version               | token     | The business version of the message definition                                           | MessageDefinition.version          |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the message definition | MessageDefinition.useContext       |
| context-type-value    | composite | A use context type and value assigned to the message definition                          | MessageDefinition.useContext       |
| identifier            | token     | External identifier for the message definition                                           | MessageDefinition.identifier       |
| category              | token     | The behavior associated with the message                                                 | MessageDefinition.category         |
| event                 | token     | The event that triggers the message or link to the event definition.                     | MessageDefinition.event            |
| focus                 | token     | A resource that is a permitted focus of the message                                      | MessageDefinition.focus.code       |
| parent                | reference | A resource that is the parent of the definition                                          | MessageDefinition.parent           |
