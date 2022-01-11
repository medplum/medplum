---
title: RiskAssessment
sidebar_position: 523
---

# RiskAssessment

An assessment of the likely outcome(s) for a patient or other subject as well as the likelihood of each outcome.

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
| identifier        | 0..\* | Identifier      | Unique identifier for the assessment                   |
| basedOn           | 0..1  | Reference       | Request fulfilled by this assessment                   |
| parent            | 0..1  | Reference       | Part of this occurrence                                |
| status            | 1..1  | code            | registered \| preliminary \| final \| amended +        |
| method            | 0..1  | CodeableConcept | Evaluation mechanism                                   |
| code              | 0..1  | CodeableConcept | Type of assessment                                     |
| subject           | 1..1  | Reference       | Who/what does assessment apply to?                     |
| encounter         | 0..1  | Reference       | Where was assessment performed?                        |
| occurrence[x]     | 0..1  | dateTime        | When was assessment made?                              |
| condition         | 0..1  | Reference       | Condition assessed                                     |
| performer         | 0..1  | Reference       | Who did assessment?                                    |
| reasonCode        | 0..\* | CodeableConcept | Why the assessment was necessary?                      |
| reasonReference   | 0..\* | Reference       | Why the assessment was necessary?                      |
| basis             | 0..\* | Reference       | Information used in assessment                         |
| prediction        | 0..\* | BackboneElement | Outcome predicted                                      |
| mitigation        | 0..1  | string          | How to reduce risk                                     |
| note              | 0..\* | Annotation      | Comments on the risk assessment                        |

## Search Parameters

| Name        | Type      | Description                                            | Expression                                |
| ----------- | --------- | ------------------------------------------------------ | ----------------------------------------- |
| date        | date      | When was assessment made?                              | RiskAssessment.occurrence                 |
| identifier  | token     | Unique identifier for the assessment                   | RiskAssessment.identifier                 |
| patient     | reference | Who/what does assessment apply to?                     | RiskAssessment.subject                    |
| encounter   | reference | Where was assessment performed?                        | RiskAssessment.encounter                  |
| condition   | reference | Condition assessed                                     | RiskAssessment.condition                  |
| method      | token     | Evaluation mechanism                                   | RiskAssessment.method                     |
| performer   | reference | Who did assessment?                                    | RiskAssessment.performer                  |
| probability | number    | Likelihood of specified outcome                        | RiskAssessment.prediction.probability     |
| risk        | token     | Likelihood of specified outcome as a qualitative value | RiskAssessment.prediction.qualitativeRisk |
| subject     | reference | Who/what does assessment apply to?                     | RiskAssessment.subject                    |
