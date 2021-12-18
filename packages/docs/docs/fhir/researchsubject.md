---
title: ResearchSubject
sidebar_position: 522
---

# ResearchSubject

A physical entity which is the primary unit of operational and/or administrative interest in a study.

## Properties

| Name                                                                                                               | Card  | Type       | Description                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ----- | ---------- | ---------------------------------------------------------------------------------------------- |
| id                                                                                                                 | 0..1  | string     | Logical id of this artifact                                                                    |
| meta                                                                                                               | 0..1  | Meta       | Metadata about the resource                                                                    |
| implicitRules                                                                                                      | 0..1  | uri        | A set of rules under which this content was created                                            |
| language                                                                                                           | 0..1  | code       | Language of the resource content                                                               |
| text                                                                                                               | 0..1  | Narrative  | Text summary of the resource, for human interpretation                                         |
| contained                                                                                                          | 0..\* | Resource   | Contained, inline Resources                                                                    |
| extension                                                                                                          | 0..\* | Extension  | Additional content defined by implementations                                                  |
| modifierExtension                                                                                                  | 0..\* | Extension  | Extensions that cannot be ignored                                                              |
| identifier                                                                                                         | 0..\* | Identifier | Business Identifier for research subject in a study                                            |
| status                                                                                                             | 1..1  | code       | candidate \| eligible \| follow-up \| ineligible \| not-registered \| off-study \| on-study \| |
| on-study-intervention \| on-study-observation \| pending-on-study \| potential-candidate \| screening \| withdrawn |
| period                                                                                                             | 0..1  | Period     | Start and end of participation                                                                 |
| study                                                                                                              | 1..1  | Reference  | Study subject is part of                                                                       |
| individual                                                                                                         | 1..1  | Reference  | Who is part of study                                                                           |
| assignedArm                                                                                                        | 0..1  | string     | What path should be followed                                                                   |
| actualArm                                                                                                          | 0..1  | string     | What path was followed                                                                         |
| consent                                                                                                            | 0..1  | Reference  | Agreement to participate in study                                                              |

## Search Parameters

| Name       | Type      | Description                                                                                                                                                                                                       | Expression                 |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| date       | date      | Start and end of participation                                                                                                                                                                                    | ResearchSubject.period     |
| identifier | token     | Business Identifier for research subject in a study                                                                                                                                                               | ResearchSubject.identifier |
| individual | reference | Who is part of study                                                                                                                                                                                              | ResearchSubject.individual |
| patient    | reference | Who is part of study                                                                                                                                                                                              | ResearchSubject.individual |
| status     | token     | candidate \| eligible \| follow-up \| ineligible \| not-registered \| off-study \| on-study \| on-study-intervention \| on-study-observation \| pending-on-study \| potential-candidate \| screening \| withdrawn | ResearchSubject.status     |
| study      | reference | Study subject is part of                                                                                                                                                                                          | ResearchSubject.study      |
