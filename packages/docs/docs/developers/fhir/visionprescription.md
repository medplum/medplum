---
title: VisionPrescription
sidebar_position: 659
---

# VisionPrescription

An authorization for the provision of glasses and/or contact lenses to a patient.

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
| identifier        | 0..\* | Identifier      | Business Identifier for vision prescription            |
| status            | 1..1  | code            | active \| cancelled \| draft \| entered-in-error       |
| created           | 1..1  | dateTime        | Response creation date                                 |
| patient           | 1..1  | Reference       | Who prescription is for                                |
| encounter         | 0..1  | Reference       | Created during encounter / admission / stay            |
| dateWritten       | 1..1  | dateTime        | When prescription was authorized                       |
| prescriber        | 1..1  | Reference       | Who authorized the vision prescription                 |
| lensSpecification | 1..\* | BackboneElement | Vision lens authorization                              |

## Search Parameters

| Name        | Type      | Description                                         | Expression                     |
| ----------- | --------- | --------------------------------------------------- | ------------------------------ |
| identifier  | token     | Return prescriptions with this external identifier  | VisionPrescription.identifier  |
| patient     | reference | The identity of a patient to list dispenses for     | VisionPrescription.patient     |
| encounter   | reference | Return prescriptions with this encounter identifier | VisionPrescription.encounter   |
| datewritten | date      | Return prescriptions written on this date           | VisionPrescription.dateWritten |
| prescriber  | reference | Who authorized the vision prescription              | VisionPrescription.prescriber  |
| status      | token     | The status of the vision prescription               | VisionPrescription.status      |
