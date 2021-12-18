---
title: Coverage
sidebar_position: 194
---

# Coverage

Financial instrument which may be used to reimburse or pay for health care products and services. Includes both insurance and self-payment.

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
| identifier        | 0..\* | Identifier      | Business Identifier for the coverage                   |
| status            | 1..1  | code            | active \| cancelled \| draft \| entered-in-error       |
| type              | 0..1  | CodeableConcept | Coverage category such as medical or accident          |
| policyHolder      | 0..1  | Reference       | Owner of the policy                                    |
| subscriber        | 0..1  | Reference       | Subscriber to the policy                               |
| subscriberId      | 0..1  | string          | ID assigned to the subscriber                          |
| beneficiary       | 1..1  | Reference       | Plan beneficiary                                       |
| dependent         | 0..1  | string          | Dependent number                                       |
| relationship      | 0..1  | CodeableConcept | Beneficiary relationship to the subscriber             |
| period            | 0..1  | Period          | Coverage start and end dates                           |
| payor             | 1..\* | Reference       | Issuer of the policy                                   |
| class             | 0..\* | BackboneElement | Additional coverage classifications                    |
| order             | 0..1  | positiveInt     | Relative order of the coverage                         |
| network           | 0..1  | string          | Insurer network                                        |
| costToBeneficiary | 0..\* | BackboneElement | Patient payments for services/products                 |
| subrogation       | 0..1  | boolean         | Reimbursement to insurer                               |
| contract          | 0..\* | Reference       | Contract details                                       |

## Search Parameters

| Name          | Type      | Description                                                    | Expression            |
| ------------- | --------- | -------------------------------------------------------------- | --------------------- |
| beneficiary   | reference | Covered party                                                  | Coverage.beneficiary  |
| class-type    | token     | Coverage class (eg. plan, group)                               | Coverage.class.type   |
| class-value   | string    | Value of the class (eg. Plan number, group number)             | Coverage.class.value  |
| dependent     | string    | Dependent number                                               | Coverage.dependent    |
| identifier    | token     | The primary identifier of the insured and the coverage         | Coverage.identifier   |
| patient       | reference | Retrieve coverages for a patient                               | Coverage.beneficiary  |
| payor         | reference | The identity of the insurer or party paying for services       | Coverage.payor        |
| policy-holder | reference | Reference to the policyholder                                  | Coverage.policyHolder |
| status        | token     | The status of the Coverage                                     | Coverage.status       |
| subscriber    | reference | Reference to the subscriber                                    | Coverage.subscriber   |
| type          | token     | The kind of coverage (health plan, auto, Workers Compensation) | Coverage.type         |
