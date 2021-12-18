---
title: CoverageEligibilityRequest
sidebar_position: 198
---

# CoverageEligibilityRequest

The CoverageEligibilityRequest provides patient and insurance coverage information to an insurer for them to respond, in
the form of an CoverageEligibilityResponse, with information regarding whether the stated coverage is valid and in-force
and optionally to provide the insurance details of the policy.

## Properties

| Name              | Card  | Type            | Description                                              |
| ----------------- | ----- | --------------- | -------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                              |
| meta              | 0..1  | Meta            | Metadata about the resource                              |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created      |
| language          | 0..1  | code            | Language of the resource content                         |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation   |
| contained         | 0..\* | Resource        | Contained, inline Resources                              |
| extension         | 0..\* | Extension       | Additional content defined by implementations            |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                        |
| identifier        | 0..\* | Identifier      | Business Identifier for coverage eligiblity request      |
| status            | 1..1  | code            | active \| cancelled \| draft \| entered-in-error         |
| priority          | 0..1  | CodeableConcept | Desired processing priority                              |
| purpose           | 1..\* | code            | auth-requirements \| benefits \| discovery \| validation |
| patient           | 1..1  | Reference       | Intended recipient of products and services              |
| serviced[x]       | 0..1  | date            | Estimated date or dates of service                       |
| created           | 1..1  | dateTime        | Creation date                                            |
| enterer           | 0..1  | Reference       | Author                                                   |
| provider          | 0..1  | Reference       | Party responsible for the request                        |
| insurer           | 1..1  | Reference       | Coverage issuer                                          |
| facility          | 0..1  | Reference       | Servicing facility                                       |
| supportingInfo    | 0..\* | BackboneElement | Supporting information                                   |
| insurance         | 0..\* | BackboneElement | Patient insurance information                            |
| item              | 0..\* | BackboneElement | Item to be evaluated for eligibiity                      |

## Search Parameters

| Name       | Type      | Description                                     | Expression                            |
| ---------- | --------- | ----------------------------------------------- | ------------------------------------- |
| created    | date      | The creation date for the EOB                   | CoverageEligibilityRequest.created    |
| enterer    | reference | The party who is responsible for the request    | CoverageEligibilityRequest.enterer    |
| facility   | reference | Facility responsible for the goods and services | CoverageEligibilityRequest.facility   |
| identifier | token     | The business identifier of the Eligibility      | CoverageEligibilityRequest.identifier |
| patient    | reference | The reference to the patient                    | CoverageEligibilityRequest.patient    |
| provider   | reference | The reference to the provider                   | CoverageEligibilityRequest.provider   |
| status     | token     | The status of the EligibilityRequest            | CoverageEligibilityRequest.status     |
