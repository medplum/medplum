---
title: Media
sidebar_position: 368
---

# Media

A photo, video, or audio recording acquired or used in healthcare. The actual content may be inline or provided by direct reference.

## Properties

| Name              | Card  | Type            | Description                                                                                              |
| ----------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                                              |
| meta              | 0..1  | Meta            | Metadata about the resource                                                                              |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                                      |
| language          | 0..1  | code            | Language of the resource content                                                                         |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                   |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                                              |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                                            |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                                        |
| identifier        | 0..\* | Identifier      | Identifier(s) for the image                                                                              |
| basedOn           | 0..\* | Reference       | Procedure that caused this media to be created                                                           |
| partOf            | 0..\* | Reference       | Part of referenced event                                                                                 |
| status            | 1..1  | code            | preparation \| in-progress \| not-done \| on-hold \| stopped \| completed \| entered-in-error \| unknown |
| type              | 0..1  | CodeableConcept | Classification of media as image, video, or audio                                                        |
| modality          | 0..1  | CodeableConcept | The type of acquisition equipment/process                                                                |
| view              | 0..1  | CodeableConcept | Imaging view, e.g. Lateral or Antero-posterior                                                           |
| subject           | 0..1  | Reference       | Who/What this Media is a record of                                                                       |
| encounter         | 0..1  | Reference       | Encounter associated with media                                                                          |
| created[x]        | 0..1  | dateTime        | When Media was collected                                                                                 |
| issued            | 0..1  | instant         | Date/Time this version was made available                                                                |
| operator          | 0..1  | Reference       | The person who generated the image                                                                       |
| reasonCode        | 0..\* | CodeableConcept | Why was event performed?                                                                                 |
| bodySite          | 0..1  | CodeableConcept | Observed body part                                                                                       |
| deviceName        | 0..1  | string          | Name of the device/manufacturer                                                                          |
| device            | 0..1  | Reference       | Observing Device                                                                                         |
| height            | 0..1  | positiveInt     | Height of the image in pixels (photo/video)                                                              |
| width             | 0..1  | positiveInt     | Width of the image in pixels (photo/video)                                                               |
| frames            | 0..1  | positiveInt     | Number of frames if > 1 (photo)                                                                          |
| duration          | 0..1  | decimal         | Length in seconds (audio / video)                                                                        |
| content           | 1..1  | Attachment      | Actual Media - reference or data                                                                         |
| note              | 0..\* | Annotation      | Comments made about the media                                                                            |

## Search Parameters

| Name       | Type      | Description                                                                                              | Expression       |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| based-on   | reference | Procedure that caused this media to be created                                                           | Media.basedOn    |
| created    | date      | When Media was collected                                                                                 | Media.created    |
| device     | reference | Observing Device                                                                                         | Media.device     |
| encounter  | reference | Encounter associated with media                                                                          | Media.encounter  |
| identifier | token     | Identifier(s) for the image                                                                              | Media.identifier |
| modality   | token     | The type of acquisition equipment/process                                                                | Media.modality   |
| operator   | reference | The person who generated the image                                                                       | Media.operator   |
| patient    | reference | Who/What this Media is a record of                                                                       | Media.subject    |
| site       | token     | Observed body part                                                                                       | Media.bodySite   |
| status     | token     | preparation \| in-progress \| not-done \| on-hold \| stopped \| completed \| entered-in-error \| unknown | Media.status     |
| subject    | reference | Who/What this Media is a record of                                                                       | Media.subject    |
| type       | token     | Classification of media as image, video, or audio                                                        | Media.type       |
| view       | token     | Imaging view, e.g. Lateral or Antero-posterior                                                           | Media.view       |
