---
title: Account
sidebar_position: 57
---

# Account

A financial tool for tracking value accrued for a particular purpose. In the healthcare field, used to track charges for a patient, cost centers, etc.

## Properties

| Name              | Card  | Type            | Description                                                                     |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                     |
| meta              | 0..1  | Meta            | Metadata about the resource                                                     |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                             |
| language          | 0..1  | code            | Language of the resource content                                                |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                          |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                     |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                   |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                               |
| identifier        | 0..\* | Identifier      | Account number                                                                  |
| status            | 1..1  | code            | active \| inactive \| entered-in-error \| on-hold \| unknown                    |
| type              | 0..1  | CodeableConcept | E.g. patient, expense, depreciation                                             |
| name              | 0..1  | string          | Human-readable label                                                            |
| subject           | 0..\* | Reference       | The entity that caused the expenses                                             |
| servicePeriod     | 0..1  | Period          | Transaction window                                                              |
| coverage          | 0..\* | BackboneElement | The party(s) that are responsible for covering the payment of this account, and |

what order should they be applied to the account
| owner | 0..1 | Reference | Entity managing the Account
| description | 0..1 | string | Explanation of purpose/use
| guarantor | 0..\* | BackboneElement | The parties ultimately responsible for balancing the Account
| partOf | 0..1 | Reference | Reference to a parent Account

## Search Parameters

| Name       | Type      | Description                                                  | Expression            |
| ---------- | --------- | ------------------------------------------------------------ | --------------------- |
| identifier | token     | Account number                                               | Account.identifier    |
| name       | string    | Human-readable label                                         | Account.name          |
| owner      | reference | Entity managing the Account                                  | Account.owner         |
| patient    | reference | The entity that caused the expenses                          | Account.subject       |
| period     | date      | Transaction window                                           | Account.servicePeriod |
| status     | token     | active \| inactive \| entered-in-error \| on-hold \| unknown | Account.status        |
| subject    | reference | The entity that caused the expenses                          | Account.subject       |
| type       | token     | E.g. patient, expense, depreciation                          | Account.type          |
