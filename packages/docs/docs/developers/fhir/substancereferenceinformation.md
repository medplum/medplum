---
title: SubstanceReferenceInformation
sidebar_position: 577
---

# SubstanceReferenceInformation

Todo.

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
| comment           | 0..1  | string          | Todo                                                   |
| gene              | 0..\* | BackboneElement | Todo                                                   |
| geneElement       | 0..\* | BackboneElement | Todo                                                   |
| classification    | 0..\* | BackboneElement | Todo                                                   |
| target            | 0..\* | BackboneElement | Todo                                                   |

## Search Parameters

| Name | Type | Description | Expression |
| ---- | ---- | ----------- | ---------- |
