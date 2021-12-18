---
title: Basic
sidebar_position: 77
---

# Basic

Basic is used for handling concepts not yet defined in FHIR, narrative-only resources that don't map to an existing
resource, and custom resources not appropriate for inclusion in the FHIR specification.

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
| code              | 1..1  | CodeableConcept | Kind of Resource                                       |
| subject           | 0..1  | Reference       | Identifies the focus of this resource                  |
| created           | 0..1  | date            | When created                                           |
| author            | 0..1  | Reference       | Who created                                            |

## Search Parameters

| Name       | Type      | Description                           | Expression       |
| ---------- | --------- | ------------------------------------- | ---------------- |
| author     | reference | Who created                           | Basic.author     |
| code       | token     | Kind of Resource                      | Basic.code       |
| created    | date      | When created                          | Basic.created    |
| identifier | token     | Business identifier                   | Basic.identifier |
| patient    | reference | Identifies the focus of this resource | Basic.subject    |
| subject    | reference | Identifies the focus of this resource | Basic.subject    |
