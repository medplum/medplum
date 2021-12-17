---
title: MessageHeader
sidebar_position: 433
---

# MessageHeader

The header for a message exchange that is either requesting or responding to an action. The reference(s) that are the
subject of the action as well as other information related to the action are typically transmitted in a bundle in which
the MessageHeader resource instance is the first resource in the bundle.

## Properties

| Name              | Card  | Type            | Description                                                            |
| ----------------- | ----- | --------------- | ---------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                            |
| meta              | 0..1  | Meta            | Metadata about the resource                                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                    |
| language          | 0..1  | code            | Language of the resource content                                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                 |
| contained         | 0..\* | Resource        | Contained, inline Resources                                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations                          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                      |
| event[x]          | 1..1  | Coding          | Code for the event this message represents or link to event definition |
| destination       | 0..\* | BackboneElement | Message destination application(s)                                     |
| sender            | 0..1  | Reference       | Real world sender of the message                                       |
| enterer           | 0..1  | Reference       | The source of the data entry                                           |
| author            | 0..1  | Reference       | The source of the decision                                             |
| source            | 1..1  | BackboneElement | Message source application                                             |
| responsible       | 0..1  | Reference       | Final responsibility for event                                         |
| reason            | 0..1  | CodeableConcept | Cause of event                                                         |
| response          | 0..1  | BackboneElement | If this is a reply to prior message                                    |
| focus             | 0..\* | Reference       | The actual content of the message                                      |
| definition        | 0..1  | canonical       | Link to the definition for this message                                |

## Search Parameters

| Name            | Type      | Description                                                            | Expression                         |
| --------------- | --------- | ---------------------------------------------------------------------- | ---------------------------------- |
| author          | reference | The source of the decision                                             | MessageHeader.author               |
| code            | token     | ok \| transient-error \| fatal-error                                   | MessageHeader.response.code        |
| destination     | string    | Name of system                                                         | MessageHeader.destination.name     |
| destination-uri | uri       | Actual destination address or id                                       | MessageHeader.destination.endpoint |
| enterer         | reference | The source of the data entry                                           | MessageHeader.enterer              |
| event           | token     | Code for the event this message represents or link to event definition | MessageHeader.event                |
| focus           | reference | The actual content of the message                                      | MessageHeader.focus                |
| receiver        | reference | Intended "real-world" recipient for the data                           | MessageHeader.destination.receiver |
| response-id     | token     | Id of original message                                                 | MessageHeader.response.identifier  |
| responsible     | reference | Final responsibility for event                                         | MessageHeader.responsible          |
| sender          | reference | Real world sender of the message                                       | MessageHeader.sender               |
| source          | string    | Name of system                                                         | MessageHeader.source.name          |
| source-uri      | uri       | Actual message source address or id                                    | MessageHeader.source.endpoint      |
| target          | reference | Particular delivery destination within the destination                 | MessageHeader.destination.target   |
