---
title: Procedure
sidebar_position: 496
---

# Procedure

An action that is or was performed on or for a patient. This can be a physical intervention like an operation, or less
invasive like long term services, counseling, or hypnotherapy.

## Properties

| Name                  | Card  | Type            | Description                                                                                              |
| --------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------- |
| id                    | 0..1  | string          | Logical id of this artifact                                                                              |
| meta                  | 0..1  | Meta            | Metadata about the resource                                                                              |
| implicitRules         | 0..1  | uri             | A set of rules under which this content was created                                                      |
| language              | 0..1  | code            | Language of the resource content                                                                         |
| text                  | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                   |
| contained             | 0..\* | Resource        | Contained, inline Resources                                                                              |
| extension             | 0..\* | Extension       | Additional content defined by implementations                                                            |
| modifierExtension     | 0..\* | Extension       | Extensions that cannot be ignored                                                                        |
| identifier            | 0..\* | Identifier      | External Identifiers for this procedure                                                                  |
| instantiatesCanonical | 0..\* | canonical       | Instantiates FHIR protocol or definition                                                                 |
| instantiatesUri       | 0..\* | uri             | Instantiates external protocol or definition                                                             |
| basedOn               | 0..\* | Reference       | A request for this procedure                                                                             |
| partOf                | 0..\* | Reference       | Part of referenced event                                                                                 |
| status                | 1..1  | code            | preparation \| in-progress \| not-done \| on-hold \| stopped \| completed \| entered-in-error \| unknown |
| statusReason          | 0..1  | CodeableConcept | Reason for current status                                                                                |
| category              | 0..1  | CodeableConcept | Classification of the procedure                                                                          |
| code                  | 0..1  | CodeableConcept | Identification of the procedure                                                                          |
| subject               | 1..1  | Reference       | Who the procedure was performed on                                                                       |
| encounter             | 0..1  | Reference       | Encounter created as part of                                                                             |
| performed[x]          | 0..1  | dateTime        | When the procedure was performed                                                                         |
| recorder              | 0..1  | Reference       | Who recorded the procedure                                                                               |
| asserter              | 0..1  | Reference       | Person who asserts this procedure                                                                        |
| performer             | 0..\* | BackboneElement | The people who performed the procedure                                                                   |
| location              | 0..1  | Reference       | Where the procedure happened                                                                             |
| reasonCode            | 0..\* | CodeableConcept | Coded reason procedure performed                                                                         |
| reasonReference       | 0..\* | Reference       | The justification that the procedure was performed                                                       |
| bodySite              | 0..\* | CodeableConcept | Target body sites                                                                                        |
| outcome               | 0..1  | CodeableConcept | The result of procedure                                                                                  |
| report                | 0..\* | Reference       | Any report resulting from the procedure                                                                  |
| complication          | 0..\* | CodeableConcept | Complication following the procedure                                                                     |
| complicationDetail    | 0..\* | Reference       | A condition that is a result of the procedure                                                            |
| followUp              | 0..\* | CodeableConcept | Instructions for follow up                                                                               |
| note                  | 0..\* | Annotation      | Additional information about the procedure                                                               |
| focalDevice           | 0..\* | BackboneElement | Manipulated, implanted, or removed device                                                                |
| usedReference         | 0..\* | Reference       | Items used during procedure                                                                              |
| usedCode              | 0..\* | CodeableConcept | Coded items used during the procedure                                                                    |

## Search Parameters

| Name                   | Type      | Description                                                                                              | Expression                      |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| code                   | token     | A code to identify a procedure                                                                           | Procedure.code                  |
| date                   | date      | When the procedure was performed                                                                         | Procedure.performed             |
| identifier             | token     | A unique identifier for a procedure                                                                      | Procedure.identifier            |
| patient                | reference | Search by subject - a patient                                                                            | Procedure.subject               |
| encounter              | reference | Encounter created as part of                                                                             | Procedure.encounter             |
| based-on               | reference | A request for this procedure                                                                             | Procedure.basedOn               |
| category               | token     | Classification of the procedure                                                                          | Procedure.category              |
| instantiates-canonical | reference | Instantiates FHIR protocol or definition                                                                 | Procedure.instantiatesCanonical |
| instantiates-uri       | uri       | Instantiates external protocol or definition                                                             | Procedure.instantiatesUri       |
| location               | reference | Where the procedure happened                                                                             | Procedure.location              |
| part-of                | reference | Part of referenced event                                                                                 | Procedure.partOf                |
| performer              | reference | The reference to the practitioner                                                                        | Procedure.performer.actor       |
| reason-code            | token     | Coded reason procedure performed                                                                         | Procedure.reasonCode            |
| reason-reference       | reference | The justification that the procedure was performed                                                       | Procedure.reasonReference       |
| status                 | token     | preparation \| in-progress \| not-done \| on-hold \| stopped \| completed \| entered-in-error \| unknown | Procedure.status                |
| subject                | reference | Search by subject                                                                                        | Procedure.subject               |
