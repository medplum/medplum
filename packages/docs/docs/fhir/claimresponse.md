---
title: ClaimResponse
sidebar_position: 130
---

# ClaimResponse

This resource provides the adjudication details from the processing of a Claim resource.

## Properties

| Name                 | Card  | Type            | Description                                            |
| -------------------- | ----- | --------------- | ------------------------------------------------------ |
| id                   | 0..1  | string          | Logical id of this artifact                            |
| meta                 | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules        | 0..1  | uri             | A set of rules under which this content was created    |
| language             | 0..1  | code            | Language of the resource content                       |
| text                 | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained            | 0..\* | Resource        | Contained, inline Resources                            |
| extension            | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension    | 0..\* | Extension       | Extensions that cannot be ignored                      |
| identifier           | 0..\* | Identifier      | Business Identifier for a claim response               |
| status               | 1..1  | code            | active \| cancelled \| draft \| entered-in-error       |
| type                 | 1..1  | CodeableConcept | More granular claim type                               |
| subType              | 0..1  | CodeableConcept | More granular claim type                               |
| use                  | 1..1  | code            | claim \| preauthorization \| predetermination          |
| patient              | 1..1  | Reference       | The recipient of the products and services             |
| created              | 1..1  | dateTime        | Response creation date                                 |
| insurer              | 1..1  | Reference       | Party responsible for reimbursement                    |
| requestor            | 0..1  | Reference       | Party responsible for the claim                        |
| request              | 0..1  | Reference       | Id of resource triggering adjudication                 |
| outcome              | 1..1  | code            | queued \| complete \| error \| partial                 |
| disposition          | 0..1  | string          | Disposition Message                                    |
| preAuthRef           | 0..1  | string          | Preauthorization reference                             |
| preAuthPeriod        | 0..1  | Period          | Preauthorization reference effective period            |
| payeeType            | 0..1  | CodeableConcept | Party to be paid any benefits payable                  |
| item                 | 0..\* | BackboneElement | Adjudication for claim line items                      |
| addItem              | 0..\* | BackboneElement | Insurer added line items                               |
| adjudication         | 0..\* |                 | Header-level adjudication                              |
| total                | 0..\* | BackboneElement | Adjudication totals                                    |
| payment              | 0..1  | BackboneElement | Payment Details                                        |
| fundsReserve         | 0..1  | CodeableConcept | Funds reserved status                                  |
| formCode             | 0..1  | CodeableConcept | Printed form identifier                                |
| form                 | 0..1  | Attachment      | Printed reference or actual form                       |
| processNote          | 0..\* | BackboneElement | Note concerning adjudication                           |
| communicationRequest | 0..\* | Reference       | Request for additional information                     |
| insurance            | 0..\* | BackboneElement | Patient insurance information                          |
| error                | 0..\* | BackboneElement | Processing errors                                      |

## Search Parameters

| Name         | Type      | Description                                    | Expression                 |
| ------------ | --------- | ---------------------------------------------- | -------------------------- |
| created      | date      | The creation date                              | ClaimResponse.created      |
| disposition  | string    | The contents of the disposition message        | ClaimResponse.disposition  |
| identifier   | token     | The identity of the ClaimResponse              | ClaimResponse.identifier   |
| insurer      | reference | The organization which generated this resource | ClaimResponse.insurer      |
| outcome      | token     | The processing outcome                         | ClaimResponse.outcome      |
| patient      | reference | The subject of care                            | ClaimResponse.patient      |
| payment-date | date      | The expected payment date                      | ClaimResponse.payment.date |
| request      | reference | The claim reference                            | ClaimResponse.request      |
| requestor    | reference | The Provider of the claim                      | ClaimResponse.requestor    |
| status       | token     | The status of the ClaimResponse                | ClaimResponse.status       |
| use          | token     | The type of claim                              | ClaimResponse.use          |
