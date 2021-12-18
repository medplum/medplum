---
title: Goal
sidebar_position: 294
---

# Goal

Describes the intended objective(s) for a patient, group or organization care, for example, weight loss, restoring an
activity of daily living, obtaining herd immunity via immunization, meeting a process improvement objective, etc.

## Properties

| Name                                                        | Card  | Type            | Description                                                                                                    |
| ----------------------------------------------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| id                                                          | 0..1  | string          | Logical id of this artifact                                                                                    |
| meta                                                        | 0..1  | Meta            | Metadata about the resource                                                                                    |
| implicitRules                                               | 0..1  | uri             | A set of rules under which this content was created                                                            |
| language                                                    | 0..1  | code            | Language of the resource content                                                                               |
| text                                                        | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                         |
| contained                                                   | 0..\* | Resource        | Contained, inline Resources                                                                                    |
| extension                                                   | 0..\* | Extension       | Additional content defined by implementations                                                                  |
| modifierExtension                                           | 0..\* | Extension       | Extensions that cannot be ignored                                                                              |
| identifier                                                  | 0..\* | Identifier      | External Ids for this goal                                                                                     |
| lifecycleStatus                                             | 1..1  | code            | proposed \| planned \| accepted \| active \| on-hold \| completed \| cancelled \| entered-in-error \| rejected |
| achievementStatus                                           | 0..1  | CodeableConcept | in-progress \| improving \| worsening \| no-change \| achieved \|                                              |
| sustaining \| not-achieved \| no-progress \| not-attainable |
| category                                                    | 0..\* | CodeableConcept | E.g. Treatment, dietary, behavioral, etc.                                                                      |
| priority                                                    | 0..1  | CodeableConcept | high-priority \| medium-priority \| low-priority                                                               |
| description                                                 | 1..1  | CodeableConcept | Code or text describing goal                                                                                   |
| subject                                                     | 1..1  | Reference       | Who this goal is intended for                                                                                  |
| start[x]                                                    | 0..1  | date            | When goal pursuit begins                                                                                       |
| target                                                      | 0..\* | BackboneElement | Target outcome for the goal                                                                                    |
| statusDate                                                  | 0..1  | date            | When goal status took effect                                                                                   |
| statusReason                                                | 0..1  | string          | Reason for current status                                                                                      |
| expressedBy                                                 | 0..1  | Reference       | Who's responsible for creating Goal?                                                                           |
| addresses                                                   | 0..\* | Reference       | Issues addressed by this goal                                                                                  |
| note                                                        | 0..\* | Annotation      | Comments about the goal                                                                                        |
| outcomeCode                                                 | 0..\* | CodeableConcept | What result was achieved regarding the goal?                                                                   |
| outcomeReference                                            | 0..\* | Reference       | Observation that resulted from goal                                                                            |

## Search Parameters

| Name               | Type      | Description                                                                                                                   | Expression             |
| ------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| identifier         | token     | External Ids for this goal                                                                                                    | Goal.identifier        |
| patient            | reference | Who this goal is intended for                                                                                                 | Goal.subject           |
| achievement-status | token     | in-progress \| improving \| worsening \| no-change \| achieved \| sustaining \| not-achieved \| no-progress \| not-attainable | Goal.achievementStatus |
| category           | token     | E.g. Treatment, dietary, behavioral, etc.                                                                                     | Goal.category          |
| lifecycle-status   | token     | proposed \| planned \| accepted \| active \| on-hold \| completed \| cancelled \| entered-in-error \| rejected                | Goal.lifecycleStatus   |
| start-date         | date      | When goal pursuit begins                                                                                                      | Goal.start             |
| subject            | reference | Who this goal is intended for                                                                                                 | Goal.subject           |
| target-date        | date      | Reach goal on or before                                                                                                       | Goal.target.due        |
