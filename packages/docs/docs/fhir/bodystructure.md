---
title: BodyStructure
sidebar_position: 84
---

# BodyStructure

Record details about an anatomical structure. This resource may be used when a coded concept does not provide the necessary detail needed for the use case.

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
| identifier        | 0..\* | Identifier      | Bodystructure identifier                               |
| active            | 0..1  | boolean         | Whether this record is in active use                   |
| morphology        | 0..1  | CodeableConcept | Kind of Structure                                      |
| location          | 0..1  | CodeableConcept | Body site                                              |
| locationQualifier | 0..\* | CodeableConcept | Body site modifier                                     |
| description       | 0..1  | string          | Text description                                       |
| image             | 0..\* | Attachment      | Attached images                                        |
| patient           | 1..1  | Reference       | Who this is about                                      |

## Search Parameters

| Name       | Type      | Description              | Expression               |
| ---------- | --------- | ------------------------ | ------------------------ |
| identifier | token     | Bodystructure identifier | BodyStructure.identifier |
| location   | token     | Body site                | BodyStructure.location   |
| morphology | token     | Kind of Structure        | BodyStructure.morphology |
| patient    | reference | Who this is about        | BodyStructure.patient    |
