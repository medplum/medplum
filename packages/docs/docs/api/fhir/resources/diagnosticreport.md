---
title: DiagnosticReport
sidebar_position: 229
---

# DiagnosticReport

The findings and interpretation of diagnostic tests performed on patients, groups of patients, devices, and locations,
and/or specimens derived from these. The report includes clinical context such as requesting and provider information,
and some mix of atomic results, images, textual and coded interpretations, and formatted representation of diagnostic
reports.

## Properties

| Name               | Card  | Type            | Description                                                                |
| ------------------ | ----- | --------------- | -------------------------------------------------------------------------- |
| id                 | 0..1  | string          | Logical id of this artifact                                                |
| meta               | 0..1  | Meta            | Metadata about the resource                                                |
| implicitRules      | 0..1  | uri             | A set of rules under which this content was created                        |
| language           | 0..1  | code            | Language of the resource content                                           |
| text               | 0..1  | Narrative       | Text summary of the resource, for human interpretation                     |
| contained          | 0..\* | Resource        | Contained, inline Resources                                                |
| extension          | 0..\* | Extension       | Additional content defined by implementations                              |
| modifierExtension  | 0..\* | Extension       | Extensions that cannot be ignored                                          |
| identifier         | 0..\* | Identifier      | Business identifier for report                                             |
| basedOn            | 0..\* | Reference       | What was requested                                                         |
| status             | 1..1  | code            | registered \| partial \| preliminary \| final +                            |
| category           | 0..\* | CodeableConcept | Service category                                                           |
| code               | 1..1  | CodeableConcept | Name/Code for this diagnostic report                                       |
| subject            | 0..1  | Reference       | The subject of the report - usually, but not always, the patient           |
| encounter          | 0..1  | Reference       | Health care event when test ordered                                        |
| effective[x]       | 0..1  | dateTime        | Clinically relevant time/time-period for report                            |
| issued             | 0..1  | instant         | DateTime this version was made                                             |
| performer          | 0..\* | Reference       | Responsible Diagnostic Service                                             |
| resultsInterpreter | 0..\* | Reference       | Primary result interpreter                                                 |
| specimen           | 0..\* | Reference       | Specimens this report is based on                                          |
| result             | 0..\* | Reference       | Observations                                                               |
| imagingStudy       | 0..\* | Reference       | Reference to full details of imaging associated with the diagnostic report |
| media              | 0..\* | BackboneElement | Key images associated with this report                                     |
| conclusion         | 0..1  | string          | Clinical conclusion (interpretation) of test results                       |
| conclusionCode     | 0..\* | CodeableConcept | Codes for the clinical conclusion of test results                          |
| presentedForm      | 0..\* | Attachment      | Entire report as issued                                                    |

## Search Parameters

| Name                | Type      | Description                                                                                                                                      | Expression                          |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| code                | token     | The code for the report, as opposed to codes for the atomic results, which are the names on the observation resource referred to from the result | DiagnosticReport.code               |
| date                | date      | The clinically relevant time of the report                                                                                                       | DiagnosticReport.effective          |
| identifier          | token     | An identifier for the report                                                                                                                     | DiagnosticReport.identifier         |
| patient             | reference | The subject of the report if a patient                                                                                                           | DiagnosticReport.subject            |
| encounter           | reference | The Encounter when the order was made                                                                                                            | DiagnosticReport.encounter          |
| based-on            | reference | Reference to the service request.                                                                                                                | DiagnosticReport.basedOn            |
| category            | token     | Which diagnostic discipline/department created the report                                                                                        | DiagnosticReport.category           |
| conclusion          | token     | A coded conclusion (interpretation/impression) on the report                                                                                     | DiagnosticReport.conclusionCode     |
| issued              | date      | When the report was issued                                                                                                                       | DiagnosticReport.issued             |
| media               | reference | A reference to the image source.                                                                                                                 | DiagnosticReport.media.link         |
| performer           | reference | Who is responsible for the report                                                                                                                | DiagnosticReport.performer          |
| result              | reference | Link to an atomic result (observation resource)                                                                                                  | DiagnosticReport.result             |
| results-interpreter | reference | Who was the source of the report                                                                                                                 | DiagnosticReport.resultsInterpreter |
| specimen            | reference | The specimen details                                                                                                                             | DiagnosticReport.specimen           |
| status              | token     | The status of the report                                                                                                                         | DiagnosticReport.status             |
| subject             | reference | The subject of the report                                                                                                                        | DiagnosticReport.subject            |
