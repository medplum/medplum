---
title: ImmunizationRecommendation
sidebar_position: 318
---

# ImmunizationRecommendation

A patient's point-in-time set of recommendations (i.e. forecasting) according to a published schedule with optional supporting justification.

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
| patient           | 1..1  | Reference       | Who this profile is for                                |
| date              | 1..1  | dateTime        | Date recommendation(s) created                         |
| authority         | 0..1  | Reference       | Who is responsible for protocol                        |
| recommendation    | 1..\* | BackboneElement | Vaccine administration recommendations                 |

## Search Parameters

| Name           | Type      | Description                                        | Expression                                                             |
| -------------- | --------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| date           | date      | Date recommendation(s) created                     | ImmunizationRecommendation.date                                        |
| identifier     | token     | Business identifier                                | ImmunizationRecommendation.identifier                                  |
| information    | reference | Patient observations supporting recommendation     | ImmunizationRecommendation.recommendation.supportingPatientInformation |
| patient        | reference | Who this profile is for                            | ImmunizationRecommendation.patient                                     |
| status         | token     | Vaccine recommendation status                      | ImmunizationRecommendation.recommendation.forecastStatus               |
| support        | reference | Past immunizations supporting recommendation       | ImmunizationRecommendation.recommendation.supportingImmunization       |
| target-disease | token     | Disease to be immunized against                    | ImmunizationRecommendation.recommendation.targetDisease                |
| vaccine-type   | token     | Vaccine or vaccine group recommendation applies to | ImmunizationRecommendation.recommendation.vaccineCode                  |
