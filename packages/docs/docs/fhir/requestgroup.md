---
title: RequestGroup
sidebar_position: 512
---

# RequestGroup

A group of related requests that can be used to capture intended activities that have inter-dependencies such as "give this medication after that one".

## Properties

| Name                  | Card  | Type            | Description                                                                                                          |
| --------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| id                    | 0..1  | string          | Logical id of this artifact                                                                                          |
| meta                  | 0..1  | Meta            | Metadata about the resource                                                                                          |
| implicitRules         | 0..1  | uri             | A set of rules under which this content was created                                                                  |
| language              | 0..1  | code            | Language of the resource content                                                                                     |
| text                  | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                               |
| contained             | 0..\* | Resource        | Contained, inline Resources                                                                                          |
| extension             | 0..\* | Extension       | Additional content defined by implementations                                                                        |
| modifierExtension     | 0..\* | Extension       | Extensions that cannot be ignored                                                                                    |
| identifier            | 0..\* | Identifier      | Business identifier                                                                                                  |
| instantiatesCanonical | 0..\* | canonical       | Instantiates FHIR protocol or definition                                                                             |
| instantiatesUri       | 0..\* | uri             | Instantiates external protocol or definition                                                                         |
| basedOn               | 0..\* | Reference       | Fulfills plan, proposal, or order                                                                                    |
| replaces              | 0..\* | Reference       | Request(s) replaced by this request                                                                                  |
| groupIdentifier       | 0..1  | Identifier      | Composite request this is part of                                                                                    |
| status                | 1..1  | code            | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown                                    |
| intent                | 1..1  | code            | proposal \| plan \| directive \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option |
| priority              | 0..1  | code            | routine \| urgent \| asap \| stat                                                                                    |
| code                  | 0..1  | CodeableConcept | What's being requested/ordered                                                                                       |
| subject               | 0..1  | Reference       | Who the request group is about                                                                                       |
| encounter             | 0..1  | Reference       | Created as part of                                                                                                   |
| authoredOn            | 0..1  | dateTime        | When the request group was authored                                                                                  |
| author                | 0..1  | Reference       | Device or practitioner that authored the request group                                                               |
| reasonCode            | 0..\* | CodeableConcept | Why the request group is needed                                                                                      |
| reasonReference       | 0..\* | Reference       | Why the request group is needed                                                                                      |
| note                  | 0..\* | Annotation      | Additional notes about the response                                                                                  |
| action                | 0..\* | BackboneElement | Proposed actions, if any                                                                                             |

## Search Parameters

| Name                   | Type      | Description                                                        | Expression                         |
| ---------------------- | --------- | ------------------------------------------------------------------ | ---------------------------------- |
| author                 | reference | The author of the request group                                    | RequestGroup.author                |
| authored               | date      | The date the request group was authored                            | RequestGroup.authoredOn            |
| code                   | token     | The code of the request group                                      | RequestGroup.code                  |
| encounter              | reference | The encounter the request group applies to                         | RequestGroup.encounter             |
| group-identifier       | token     | The group identifier for the request group                         | RequestGroup.groupIdentifier       |
| identifier             | token     | External identifiers for the request group                         | RequestGroup.identifier            |
| instantiates-canonical | reference | The FHIR-based definition from which the request group is realized | RequestGroup.instantiatesCanonical |
| instantiates-uri       | uri       | The external definition from which the request group is realized   | RequestGroup.instantiatesUri       |
| intent                 | token     | The intent of the request group                                    | RequestGroup.intent                |
| participant            | reference | The participant in the requests in the group                       | RequestGroup.action.participant    |
| patient                | reference | The identity of a patient to search for request groups             | RequestGroup.subject               |
| priority               | token     | The priority of the request group                                  | RequestGroup.priority              |
| status                 | token     | The status of the request group                                    | RequestGroup.status                |
| subject                | reference | The subject that the request group is about                        | RequestGroup.subject               |
