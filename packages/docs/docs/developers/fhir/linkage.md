---
title: Linkage
sidebar_position: 348
---

# Linkage

Identifies two or more records (resource instances) that refer to the same real-world "occurrence".

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
| active            | 0..1  | boolean         | Whether this linkage assertion is active or not        |
| author            | 0..1  | Reference       | Who is responsible for linkages                        |
| item              | 1..\* | BackboneElement | Item to be linked                                      |

## Search Parameters

| Name   | Type      | Description                                                | Expression            |
| ------ | --------- | ---------------------------------------------------------- | --------------------- |
| author | reference | Author of the Linkage                                      | Linkage.author        |
| item   | reference | Matches on any item in the Linkage                         | Linkage.item.resource |
| source | reference | Matches on any item in the Linkage with a type of 'source' | Linkage.item.resource |
