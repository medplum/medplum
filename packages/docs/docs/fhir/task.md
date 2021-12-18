---
title: Task
sidebar_position: 604
---

# Task

A task to be performed.

## Properties

| Name                  | Card  | Type            | Description                                                                                                        |
| --------------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| id                    | 0..1  | string          | Logical id of this artifact                                                                                        |
| meta                  | 0..1  | Meta            | Metadata about the resource                                                                                        |
| implicitRules         | 0..1  | uri             | A set of rules under which this content was created                                                                |
| language              | 0..1  | code            | Language of the resource content                                                                                   |
| text                  | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                             |
| contained             | 0..\* | Resource        | Contained, inline Resources                                                                                        |
| extension             | 0..\* | Extension       | Additional content defined by implementations                                                                      |
| modifierExtension     | 0..\* | Extension       | Extensions that cannot be ignored                                                                                  |
| identifier            | 0..\* | Identifier      | Task Instance Identifier                                                                                           |
| instantiatesCanonical | 0..1  | canonical       | Formal definition of task                                                                                          |
| instantiatesUri       | 0..1  | uri             | Formal definition of task                                                                                          |
| basedOn               | 0..\* | Reference       | Request fulfilled by this task                                                                                     |
| groupIdentifier       | 0..1  | Identifier      | Requisition or grouper id                                                                                          |
| partOf                | 0..\* | Reference       | Composite task                                                                                                     |
| status                | 1..1  | code            | draft \| requested \| received \| accepted \| +                                                                    |
| statusReason          | 0..1  | CodeableConcept | Reason for current status                                                                                          |
| businessStatus        | 0..1  | CodeableConcept | E.g. "Specimen collected", "IV prepped"                                                                            |
| intent                | 1..1  | code            | unknown \| proposal \| plan \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option |
| priority              | 0..1  | code            | routine \| urgent \| asap \| stat                                                                                  |
| code                  | 0..1  | CodeableConcept | Task Type                                                                                                          |
| description           | 0..1  | string          | Human-readable explanation of task                                                                                 |
| focus                 | 0..1  | Reference       | What task is acting on                                                                                             |
| for                   | 0..1  | Reference       | Beneficiary of the Task                                                                                            |
| encounter             | 0..1  | Reference       | Healthcare event during which this task originated                                                                 |
| executionPeriod       | 0..1  | Period          | Start and end time of execution                                                                                    |
| authoredOn            | 0..1  | dateTime        | Task Creation Date                                                                                                 |
| lastModified          | 0..1  | dateTime        | Task Last Modified Date                                                                                            |
| requester             | 0..1  | Reference       | Who is asking for task to be done                                                                                  |
| performerType         | 0..\* | CodeableConcept | Requested performer                                                                                                |
| owner                 | 0..1  | Reference       | Responsible individual                                                                                             |
| location              | 0..1  | Reference       | Where task occurs                                                                                                  |
| reasonCode            | 0..1  | CodeableConcept | Why task is needed                                                                                                 |
| reasonReference       | 0..1  | Reference       | Why task is needed                                                                                                 |
| insurance             | 0..\* | Reference       | Associated insurance coverage                                                                                      |
| note                  | 0..\* | Annotation      | Comments made about the task                                                                                       |
| relevantHistory       | 0..\* | Reference       | Key events in history of the Task                                                                                  |
| restriction           | 0..1  | BackboneElement | Constraints on fulfillment tasks                                                                                   |
| input                 | 0..\* | BackboneElement | Information used to perform task                                                                                   |
| output                | 0..\* | BackboneElement | Information produced as part of task                                                                               |

## Search Parameters

| Name             | Type      | Description                                                                      | Expression           |
| ---------------- | --------- | -------------------------------------------------------------------------------- | -------------------- |
| authored-on      | date      | Search by creation date                                                          | Task.authoredOn      |
| based-on         | reference | Search by requests this task is based on                                         | Task.basedOn         |
| business-status  | token     | Search by business status                                                        | Task.businessStatus  |
| code             | token     | Search by task code                                                              | Task.code            |
| encounter        | reference | Search by encounter                                                              | Task.encounter       |
| focus            | reference | Search by task focus                                                             | Task.focus           |
| group-identifier | token     | Search by group identifier                                                       | Task.groupIdentifier |
| identifier       | token     | Search for a task instance by its business identifier                            | Task.identifier      |
| intent           | token     | Search by task intent                                                            | Task.intent          |
| modified         | date      | Search by last modification date                                                 | Task.lastModified    |
| owner            | reference | Search by task owner                                                             | Task.owner           |
| part-of          | reference | Search by task this task is part of                                              | Task.partOf          |
| patient          | reference | Search by patient                                                                | Task.for             |
| performer        | token     | Search by recommended type of performer (e.g., Requester, Performer, Scheduler). | Task.performerType   |
| period           | date      | Search by period Task is/was underway                                            | Task.executionPeriod |
| priority         | token     | Search by task priority                                                          | Task.priority        |
| requester        | reference | Search by task requester                                                         | Task.requester       |
| status           | token     | Search by task status                                                            | Task.status          |
| subject          | reference | Search by subject                                                                | Task.for             |
