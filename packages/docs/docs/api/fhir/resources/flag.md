---
title: Flag
sidebar_position: 293
---

# Flag

Prospective warnings of potential issues when providing care to the patient.

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
| status            | 1..1  | code            | active \| inactive \| entered-in-error                 |
| category          | 0..\* | CodeableConcept | Clinical, administrative, etc.                         |
| code              | 1..1  | CodeableConcept | Coded or textual message to display to user            |
| subject           | 1..1  | Reference       | Who/What is flag about?                                |
| period            | 0..1  | Period          | Time period when flag is active                        |
| encounter         | 0..1  | Reference       | Alert relevant during encounter                        |
| author            | 0..1  | Reference       | Flag creator                                           |

## Search Parameters

| Name       | Type      | Description                                 | Expression      |
| ---------- | --------- | ------------------------------------------- | --------------- |
| date       | date      | Time period when flag is active             | Flag.period     |
| patient    | reference | The identity of a subject to list flags for | Flag.subject    |
| encounter  | reference | Alert relevant during encounter             | Flag.encounter  |
| author     | reference | Flag creator                                | Flag.author     |
| identifier | token     | Business identifier                         | Flag.identifier |
| subject    | reference | The identity of a subject to list flags for | Flag.subject    |
