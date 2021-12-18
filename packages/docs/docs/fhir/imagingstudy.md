---
title: ImagingStudy
sidebar_position: 308
---

# ImagingStudy

Representation of the content produced in a DICOM imaging study. A study comprises a set of series, each of which
includes a set of Service-Object Pair Instances (SOP Instances - images or other data) acquired or produced in a common
context. A series is of only one modality (e.g. X-ray, CT, MR, ultrasound), but a study may have multiple series of
different modalities.

## Properties

| Name               | Card  | Type            | Description                                                         |
| ------------------ | ----- | --------------- | ------------------------------------------------------------------- |
| id                 | 0..1  | string          | Logical id of this artifact                                         |
| meta               | 0..1  | Meta            | Metadata about the resource                                         |
| implicitRules      | 0..1  | uri             | A set of rules under which this content was created                 |
| language           | 0..1  | code            | Language of the resource content                                    |
| text               | 0..1  | Narrative       | Text summary of the resource, for human interpretation              |
| contained          | 0..\* | Resource        | Contained, inline Resources                                         |
| extension          | 0..\* | Extension       | Additional content defined by implementations                       |
| modifierExtension  | 0..\* | Extension       | Extensions that cannot be ignored                                   |
| identifier         | 0..\* | Identifier      | Identifiers for the whole study                                     |
| status             | 1..1  | code            | registered \| available \| cancelled \| entered-in-error \| unknown |
| modality           | 0..\* | Coding          | All series modality if actual acquisition modalities                |
| subject            | 1..1  | Reference       | Who or what is the subject of the study                             |
| encounter          | 0..1  | Reference       | Encounter with which this imaging study is associated               |
| started            | 0..1  | dateTime        | When the study was started                                          |
| basedOn            | 0..\* | Reference       | Request fulfilled                                                   |
| referrer           | 0..1  | Reference       | Referring physician                                                 |
| interpreter        | 0..\* | Reference       | Who interpreted images                                              |
| endpoint           | 0..\* | Reference       | Study access endpoint                                               |
| numberOfSeries     | 0..1  | unsignedInt     | Number of Study Related Series                                      |
| numberOfInstances  | 0..1  | unsignedInt     | Number of Study Related Instances                                   |
| procedureReference | 0..1  | Reference       | The performed Procedure reference                                   |
| procedureCode      | 0..\* | CodeableConcept | The performed procedure code                                        |
| location           | 0..1  | Reference       | Where ImagingStudy occurred                                         |
| reasonCode         | 0..\* | CodeableConcept | Why the study was requested                                         |
| reasonReference    | 0..\* | Reference       | Why was study performed                                             |
| note               | 0..\* | Annotation      | User-defined comments                                               |
| description        | 0..1  | string          | Institution-generated description                                   |
| series             | 0..\* | BackboneElement | Each study has one or more series of instances                      |

## Search Parameters

| Name        | Type      | Description                                                                      | Expression                            |
| ----------- | --------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| identifier  | token     | Identifiers for the Study, such as DICOM Study Instance UID and Accession number | ImagingStudy.identifier               |
| patient     | reference | Who the study is about                                                           | ImagingStudy.subject                  |
| basedon     | reference | The order for the image                                                          | ImagingStudy.basedOn                  |
| bodysite    | token     | The body site studied                                                            | ImagingStudy.series.bodySite          |
| dicom-class | token     | The type of the instance                                                         | ImagingStudy.series.instance.sopClass |
| encounter   | reference | The context of the study                                                         | ImagingStudy.encounter                |
| endpoint    | reference | The endpoint for the study or series                                             | ImagingStudy.endpoint                 |
| instance    | token     | SOP Instance UID for an instance                                                 | ImagingStudy.series.instance.uid      |
| interpreter | reference | Who interpreted the images                                                       | ImagingStudy.interpreter              |
| modality    | token     | The modality of the series                                                       | ImagingStudy.series.modality          |
| performer   | reference | The person who performed the study                                               | ImagingStudy.series.performer.actor   |
| reason      | token     | The reason for the study                                                         | ImagingStudy.reasonCode               |
| referrer    | reference | The referring physician                                                          | ImagingStudy.referrer                 |
| series      | token     | DICOM Series Instance UID for a series                                           | ImagingStudy.series.uid               |
| started     | date      | When the study was started                                                       | ImagingStudy.started                  |
| status      | token     | The status of the study                                                          | ImagingStudy.status                   |
| subject     | reference | Who the study is about                                                           | ImagingStudy.subject                  |
