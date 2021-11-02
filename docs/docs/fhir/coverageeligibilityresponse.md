---
title: CoverageEligibilityResponse
sidebar_position: 203
---

# CoverageEligibilityResponse

This resource provides eligibility and plan details from the processing of an CoverageEligibilityRequest resource.

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
| identifier | 0..* | Identifier | Business Identifier for coverage eligiblity request
| status | 1..1 | code | active \| cancelled \| draft \| entered-in-error
| purpose | 1..* | code | auth-requirements \| benefits \| discovery \| validation
| patient | 1..1 | Reference | Intended recipient of products and services
| serviced[x] | 0..1 | date | Estimated date or dates of service
| created | 1..1 | dateTime | Response creation date
| requestor | 0..1 | Reference | Party responsible for the request
| request | 1..1 | Reference | Eligibility request reference
| outcome | 1..1 | code | queued \| complete \| error \| partial
| disposition | 0..1 | string | Disposition Message
| insurer | 1..1 | Reference | Coverage issuer
| insurance | 0..* | BackboneElement | Patient insurance information
| preAuthRef | 0..1 | string | Preauthorization reference
| form | 0..1 | CodeableConcept | Printed form identifier
| error | 0..* | BackboneElement | Processing errors

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| created | date | The creation date | CoverageEligibilityResponse.created
| disposition | string | The contents of the disposition message | CoverageEligibilityResponse.disposition
| identifier | token | The business identifier | CoverageEligibilityResponse.identifier
| insurer | reference | The organization which generated this resource | CoverageEligibilityResponse.insurer
| outcome | token | The processing outcome | CoverageEligibilityResponse.outcome
| patient | reference | The reference to the patient | CoverageEligibilityResponse.patient
| request | reference | The EligibilityRequest reference | CoverageEligibilityResponse.request
| requestor | reference | The EligibilityRequest provider | CoverageEligibilityResponse.requestor
| status | token | The EligibilityRequest status | CoverageEligibilityResponse.status

