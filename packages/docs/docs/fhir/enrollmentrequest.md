---
title: EnrollmentRequest
sidebar_position: 252
---

# EnrollmentRequest

This resource provides the insurance enrollment details to the insurer regarding a specified coverage.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..* | Identifier | Business Identifier
| status | 0..1 | code | active \| cancelled \| draft \| entered-in-error
| created | 0..1 | dateTime | Creation date
| insurer | 0..1 | Reference | Target
| provider | 0..1 | Reference | Responsible practitioner
| candidate | 0..1 | Reference | The subject to be enrolled
| coverage | 0..1 | Reference | Insurance information

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| identifier | token | The business identifier of the Enrollment | EnrollmentRequest.identifier
| patient | reference | The party to be enrolled | EnrollmentRequest.candidate
| status | token | The status of the enrollment | EnrollmentRequest.status
| subject | reference | The party to be enrolled | EnrollmentRequest.candidate

