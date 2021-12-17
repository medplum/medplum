---
title: EpisodeOfCare
sidebar_position: 254
---

# EpisodeOfCare

An association between a patient and an organization / healthcare provider(s) during which time encounters may occur.
The managing organization assumes a level of responsibility for the patient during this time.

## Properties

| Name                 | Card  | Type            | Description                                                                                          |
| -------------------- | ----- | --------------- | ---------------------------------------------------------------------------------------------------- |
| id                   | 0..1  | string          | Logical id of this artifact                                                                          |
| meta                 | 0..1  | Meta            | Metadata about the resource                                                                          |
| implicitRules        | 0..1  | uri             | A set of rules under which this content was created                                                  |
| language             | 0..1  | code            | Language of the resource content                                                                     |
| text                 | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                               |
| contained            | 0..\* | Resource        | Contained, inline Resources                                                                          |
| extension            | 0..\* | Extension       | Additional content defined by implementations                                                        |
| modifierExtension    | 0..\* | Extension       | Extensions that cannot be ignored                                                                    |
| identifier           | 0..\* | Identifier      | Business Identifier(s) relevant for this EpisodeOfCare                                               |
| status               | 1..1  | code            | planned \| waitlist \| active \| onhold \| finished \| cancelled \| entered-in-error                 |
| statusHistory        | 0..\* | BackboneElement | Past list of status codes (the current status may be included to cover the start date of the status) |
| type                 | 0..\* | CodeableConcept | Type/class - e.g. specialist referral, disease management                                            |
| diagnosis            | 0..\* | BackboneElement | The list of diagnosis relevant to this episode of care                                               |
| patient              | 1..1  | Reference       | The patient who is the focus of this episode of care                                                 |
| managingOrganization | 0..1  | Reference       | Organization that assumes care                                                                       |
| period               | 0..1  | Period          | Interval during responsibility is assumed                                                            |
| referralRequest      | 0..\* | Reference       | Originating Referral Request(s)                                                                      |
| careManager          | 0..1  | Reference       | Care manager/care coordinator for the patient                                                        |
| team                 | 0..\* | Reference       | Other practitioners facilitating this episode of care                                                |
| account              | 0..\* | Reference       | The set of accounts that may be used for billing for this EpisodeOfCare                              |

## Search Parameters

| Name              | Type      | Description                                                                                          | Expression                         |
| ----------------- | --------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| date              | date      | The provided date search value falls within the episode of care's period                             | EpisodeOfCare.period               |
| identifier        | token     | Business Identifier(s) relevant for this EpisodeOfCare                                               | EpisodeOfCare.identifier           |
| patient           | reference | The patient who is the focus of this episode of care                                                 | EpisodeOfCare.patient              |
| type              | token     | Type/class - e.g. specialist referral, disease management                                            | EpisodeOfCare.type                 |
| care-manager      | reference | Care manager/care coordinator for the patient                                                        | EpisodeOfCare.careManager          |
| condition         | reference | Conditions/problems/diagnoses this episode of care is for                                            | EpisodeOfCare.diagnosis.condition  |
| incoming-referral | reference | Incoming Referral Request                                                                            | EpisodeOfCare.referralRequest      |
| organization      | reference | The organization that has assumed the specific responsibilities of this EpisodeOfCare                | EpisodeOfCare.managingOrganization |
| status            | token     | The current status of the Episode of Care as provided (does not check the status history collection) | EpisodeOfCare.status               |
