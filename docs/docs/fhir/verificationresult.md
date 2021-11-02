---
title: VerificationResult
sidebar_position: 655
---

# VerificationResult

Describes validation requirements, source(s), status and dates for one or more elements.

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
| target | 0..* | Reference | A resource that was validated
| targetLocation | 0..* | string | The fhirpath location(s) within the resource that was validated
| need | 0..1 | CodeableConcept | none \| initial \| periodic
| status | 1..1 | code | attested \| validated \| in-process \| req-revalid \| val-fail \| reval-fail
| statusDate | 0..1 | dateTime | When the validation status was updated
| validationType | 0..1 | CodeableConcept | nothing \| primary \| multiple
| validationProcess | 0..* | CodeableConcept | The primary process by which the target is validated (edit check; value
  set; primary source; multiple sources; standalone; in context)
| frequency | 0..1 | Timing | Frequency of revalidation
| lastPerformed | 0..1 | dateTime | The date/time validation was last completed (including failed validations)
| nextScheduled | 0..1 | date | The date when target is next validated, if appropriate
| failureAction | 0..1 | CodeableConcept | fatal \| warn \| rec-only \| none
| primarySource | 0..* | BackboneElement | Information about the primary source(s) involved in validation
| attestation | 0..1 | BackboneElement | Information about the entity attesting to information
| validator | 0..* | BackboneElement | Information about the entity validating information

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| target | reference | A resource that was validated | VerificationResult.target

