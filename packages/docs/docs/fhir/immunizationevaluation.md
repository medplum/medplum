---
title: ImmunizationEvaluation
sidebar_position: 317
---

# ImmunizationEvaluation

Describes a comparison of an immunization event against published recommendations to determine if the administration is
"valid" in relation to those recommendations.

## Properties

| Name              | Card  | Type            | Description                                              |
| ----------------- | ----- | --------------- | -------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                              |
| meta              | 0..1  | Meta            | Metadata about the resource                              |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created      |
| language          | 0..1  | code            | Language of the resource content                         |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation   |
| contained         | 0..\* | Resource        | Contained, inline Resources                              |
| extension         | 0..\* | Extension       | Additional content defined by implementations            |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                        |
| identifier        | 0..\* | Identifier      | Business identifier                                      |
| status            | 1..1  | code            | completed \| entered-in-error                            |
| patient           | 1..1  | Reference       | Who this evaluation is for                               |
| date              | 0..1  | dateTime        | Date evaluation was performed                            |
| authority         | 0..1  | Reference       | Who is responsible for publishing the recommendations    |
| targetDisease     | 1..1  | CodeableConcept | Evaluation target disease                                |
| immunizationEvent | 1..1  | Reference       | Immunization being evaluated                             |
| doseStatus        | 1..1  | CodeableConcept | Status of the dose relative to published recommendations |
| doseStatusReason  | 0..\* | CodeableConcept | Reason for the dose status                               |
| description       | 0..1  | string          | Evaluation notes                                         |
| series            | 0..1  | string          | Name of vaccine series                                   |
| doseNumber[x]     | 0..1  | positiveInt     | Dose number within series                                |
| seriesDoses[x]    | 0..1  | positiveInt     | Recommended number of doses for immunity                 |

## Search Parameters

| Name               | Type      | Description                                                  | Expression                               |
| ------------------ | --------- | ------------------------------------------------------------ | ---------------------------------------- |
| date               | date      | Date the evaluation was generated                            | ImmunizationEvaluation.date              |
| dose-status        | token     | The status of the dose relative to published recommendations | ImmunizationEvaluation.doseStatus        |
| identifier         | token     | ID of the evaluation                                         | ImmunizationEvaluation.identifier        |
| immunization-event | reference | The vaccine administration event being evaluated             | ImmunizationEvaluation.immunizationEvent |
| patient            | reference | The patient being evaluated                                  | ImmunizationEvaluation.patient           |
| status             | token     | Immunization evaluation status                               | ImmunizationEvaluation.status            |
| target-disease     | token     | The vaccine preventable disease being evaluated against      | ImmunizationEvaluation.targetDisease     |
