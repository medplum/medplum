---
title: DetectedIssue
sidebar_position: 208
---

# DetectedIssue

Indicates an actual or potential clinical issue with or between one or more active or proposed clinical actions for a
patient; e.g. Drug-drug interaction, Ineffective treatment frequency, Procedure-condition conflict, etc.

## Properties

| Name              | Card  | Type            | Description                                             |
| ----------------- | ----- | --------------- | ------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                             |
| meta              | 0..1  | Meta            | Metadata about the resource                             |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created     |
| language          | 0..1  | code            | Language of the resource content                        |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation  |
| contained         | 0..\* | Resource        | Contained, inline Resources                             |
| extension         | 0..\* | Extension       | Additional content defined by implementations           |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                       |
| identifier        | 0..\* | Identifier      | Unique id for the detected issue                        |
| status            | 1..1  | code            | registered \| preliminary \| final \| amended +         |
| code              | 0..1  | CodeableConcept | Issue Category, e.g. drug-drug, duplicate therapy, etc. |
| severity          | 0..1  | code            | high \| moderate \| low                                 |
| patient           | 0..1  | Reference       | Associated patient                                      |
| identified[x]     | 0..1  | dateTime        | When identified                                         |
| author            | 0..1  | Reference       | The provider or device that identified the issue        |
| implicated        | 0..\* | Reference       | Problem resource                                        |
| evidence          | 0..\* | BackboneElement | Supporting evidence                                     |
| detail            | 0..1  | string          | Description and context                                 |
| reference         | 0..1  | uri             | Authority for issue                                     |
| mitigation        | 0..\* | BackboneElement | Step taken to address                                   |

## Search Parameters

| Name       | Type      | Description                                             | Expression               |
| ---------- | --------- | ------------------------------------------------------- | ------------------------ |
| identifier | token     | Unique id for the detected issue                        | DetectedIssue.identifier |
| patient    | reference | Associated patient                                      | DetectedIssue.patient    |
| author     | reference | The provider or device that identified the issue        | DetectedIssue.author     |
| code       | token     | Issue Category, e.g. drug-drug, duplicate therapy, etc. | DetectedIssue.code       |
| identified | date      | When identified                                         | DetectedIssue.identified |
| implicated | reference | Problem resource                                        | DetectedIssue.implicated |
