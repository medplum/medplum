---
title: List
sidebar_position: 350
---

# List

A list is a curated collection of resources.

## Properties

| Name              | Card  | Type            | Description                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                            |
| meta              | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created    |
| language          | 0..1  | code            | Language of the resource content                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource        | Contained, inline Resources                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                      |
| identifier        | 0..\* | Identifier      | Business identifier                                    |
| status            | 1..1  | code            | current \| retired \| entered-in-error                 |
| mode              | 1..1  | code            | working \| snapshot \| changes                         |
| title             | 0..1  | string          | Descriptive name for the list                          |
| code              | 0..1  | CodeableConcept | What the purpose of this list is                       |
| subject           | 0..1  | Reference       | If all resources have the same subject                 |
| encounter         | 0..1  | Reference       | Context in which list created                          |
| date              | 0..1  | dateTime        | When the list was prepared                             |
| source            | 0..1  | Reference       | Who and/or what defined the list contents (aka Author) |
| orderedBy         | 0..1  | CodeableConcept | What order the list has                                |
| note              | 0..\* | Annotation      | Comments about the list                                |
| entry             | 0..\* | BackboneElement | Entries in the list                                    |
| emptyReason       | 0..1  | CodeableConcept | Why list is empty                                      |

## Search Parameters

| Name         | Type      | Description                                            | Expression       |
| ------------ | --------- | ------------------------------------------------------ | ---------------- |
| code         | token     | What the purpose of this list is                       | List.code        |
| date         | date      | When the list was prepared                             | List.date        |
| identifier   | token     | Business identifier                                    | List.identifier  |
| patient      | reference | If all resources have the same subject                 | List.subject     |
| encounter    | reference | Context in which list created                          | List.encounter   |
| empty-reason | token     | Why list is empty                                      | List.emptyReason |
| item         | reference | Actual entry                                           | List.entry.item  |
| notes        | string    | The annotation - text content (as markdown)            | List.note.text   |
| source       | reference | Who and/or what defined the list contents (aka Author) | List.source      |
| status       | token     | current \| retired \| entered-in-error                 | List.status      |
| subject      | reference | If all resources have the same subject                 | List.subject     |
| title        | string    | Descriptive name for the list                          | List.title       |
