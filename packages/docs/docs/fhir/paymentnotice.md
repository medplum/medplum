---
title: PaymentNotice
sidebar_position: 477
---

# PaymentNotice

This resource provides the status of the payment for goods and services rendered, and the request and response resource references.

## Properties

| Name              | Card  | Type            | Description                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                            |
| meta              | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created    |
| language          | 0..1  | code            | Language of the resource content                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource        | Contained, inline Resources                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                      |
| identifier        | 0..\* | Identifier      | Business Identifier for the payment noctice            |
| status            | 1..1  | code            | active \| cancelled \| draft \| entered-in-error       |
| request           | 0..1  | Reference       | Request reference                                      |
| response          | 0..1  | Reference       | Response reference                                     |
| created           | 1..1  | dateTime        | Creation date                                          |
| provider          | 0..1  | Reference       | Responsible practitioner                               |
| payment           | 1..1  | Reference       | Payment reference                                      |
| paymentDate       | 0..1  | date            | Payment or clearing date                               |
| payee             | 0..1  | Reference       | Party being paid                                       |
| recipient         | 1..1  | Reference       | Party being notified                                   |
| amount            | 1..1  | Money           | Monetary amount of the payment                         |
| paymentStatus     | 0..1  | CodeableConcept | Issued or cleared Status of the payment                |

## Search Parameters

| Name           | Type      | Description                           | Expression                  |
| -------------- | --------- | ------------------------------------- | --------------------------- |
| created        | date      | Creation date fro the notice          | PaymentNotice.created       |
| identifier     | token     | The business identifier of the notice | PaymentNotice.identifier    |
| payment-status | token     | The type of payment notice            | PaymentNotice.paymentStatus |
| provider       | reference | The reference to the provider         | PaymentNotice.provider      |
| request        | reference | The Claim                             | PaymentNotice.request       |
| response       | reference | The ClaimResponse                     | PaymentNotice.response      |
| status         | token     | The status of the payment notice      | PaymentNotice.status        |
