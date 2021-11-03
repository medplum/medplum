---
title: GuidanceResponse
sidebar_position: 303
---

# GuidanceResponse

A guidance response is the formal response to a guidance request, including any output parameters returned by the
  evaluation, as well as the description of any proposed actions to be taken.

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
| requestIdentifier | 0..1 | Identifier | The identifier of the request associated with this response, if any
| identifier | 0..* | Identifier | Business identifier
| module[x] | 1..1 | uri | What guidance was requested
| status | 1..1 | code | success \| data-requested \| data-required \| in-progress \| failure \| entered-in-error
| subject | 0..1 | Reference | Patient the request was performed for
| encounter | 0..1 | Reference | Encounter during which the response was returned
| occurrenceDateTime | 0..1 | dateTime | When the guidance response was processed
| performer | 0..1 | Reference | Device returning the guidance
| reasonCode | 0..* | CodeableConcept | Why guidance is needed
| reasonReference | 0..* | Reference | Why guidance is needed
| note | 0..* | Annotation | Additional notes about the response
| evaluationMessage | 0..* | Reference | Messages resulting from the evaluation of the artifact or artifacts
| outputParameters | 0..1 | Reference | The output parameters of the evaluation, if any
| result | 0..1 | Reference | Proposed actions, if any
| dataRequirement | 0..* | DataRequirement | Additional required data

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| identifier | token | The identifier of the guidance response | GuidanceResponse.identifier
| patient | reference | The identity of a patient to search for guidance response results | GuidanceResponse.subject
| request | token | The identifier of the request associated with the response | GuidanceResponse.requestIdentifier
| subject | reference | The subject that the guidance response is about | GuidanceResponse.subject

