---
title: EnrollmentResponse
sidebar_position: 253
---

# EnrollmentResponse

This resource provides enrollment and plan details from the processing of an EnrollmentRequest resource.

## Properties

| Name              | Card  | Type       | Description                                            |
| ----------------- | ----- | ---------- | ------------------------------------------------------ |
| id                | 0..1  | string     | Logical id of this artifact                            |
| meta              | 0..1  | Meta       | Metadata about the resource                            |
| implicitRules     | 0..1  | uri        | A set of rules under which this content was created    |
| language          | 0..1  | code       | Language of the resource content                       |
| text              | 0..1  | Narrative  | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource   | Contained, inline Resources                            |
| extension         | 0..\* | Extension  | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension  | Extensions that cannot be ignored                      |
| identifier        | 0..\* | Identifier | Business Identifier                                    |
| status            | 0..1  | code       | active \| cancelled \| draft \| entered-in-error       |
| request           | 0..1  | Reference  | Claim reference                                        |
| outcome           | 0..1  | code       | queued \| complete \| error \| partial                 |
| disposition       | 0..1  | string     | Disposition Message                                    |
| created           | 0..1  | dateTime   | Creation date                                          |
| organization      | 0..1  | Reference  | Insurer                                                |
| requestProvider   | 0..1  | Reference  | Responsible practitioner                               |

## Search Parameters

| Name       | Type      | Description                                       | Expression                    |
| ---------- | --------- | ------------------------------------------------- | ----------------------------- |
| identifier | token     | The business identifier of the EnrollmentResponse | EnrollmentResponse.identifier |
| request    | reference | The reference to the claim                        | EnrollmentResponse.request    |
| status     | token     | The status of the enrollment response             | EnrollmentResponse.status     |
