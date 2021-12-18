---
title: PaymentReconciliation
sidebar_position: 478
---

# PaymentReconciliation

This resource provides the details including amount of a payment and allocates the payment items being paid.

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
| identifier        | 0..\* | Identifier      | Business Identifier for a payment reconciliation       |
| status            | 1..1  | code            | active \| cancelled \| draft \| entered-in-error       |
| period            | 0..1  | Period          | Period covered                                         |
| created           | 1..1  | dateTime        | Creation date                                          |
| paymentIssuer     | 0..1  | Reference       | Party generating payment                               |
| request           | 0..1  | Reference       | Reference to requesting resource                       |
| requestor         | 0..1  | Reference       | Responsible practitioner                               |
| outcome           | 0..1  | code            | queued \| complete \| error \| partial                 |
| disposition       | 0..1  | string          | Disposition message                                    |
| paymentDate       | 1..1  | date            | When payment issued                                    |
| paymentAmount     | 1..1  | Money           | Total amount of Payment                                |
| paymentIdentifier | 0..1  | Identifier      | Business identifier for the payment                    |
| detail            | 0..\* | BackboneElement | Settlement particulars                                 |
| formCode          | 0..1  | CodeableConcept | Printed form identifier                                |
| processNote       | 0..\* | BackboneElement | Note concerning processing                             |

## Search Parameters

| Name           | Type      | Description                                           | Expression                          |
| -------------- | --------- | ----------------------------------------------------- | ----------------------------------- |
| created        | date      | The creation date                                     | PaymentReconciliation.created       |
| disposition    | string    | The contents of the disposition message               | PaymentReconciliation.disposition   |
| identifier     | token     | The business identifier of the ExplanationOfBenefit   | PaymentReconciliation.identifier    |
| outcome        | token     | The processing outcome                                | PaymentReconciliation.outcome       |
| payment-issuer | reference | The organization which generated this resource        | PaymentReconciliation.paymentIssuer |
| request        | reference | The reference to the claim                            | PaymentReconciliation.request       |
| requestor      | reference | The reference to the provider who submitted the claim | PaymentReconciliation.requestor     |
| status         | token     | The status of the payment reconciliation              | PaymentReconciliation.status        |
