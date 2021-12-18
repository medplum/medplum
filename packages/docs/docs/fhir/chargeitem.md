---
title: ChargeItem
sidebar_position: 112
---

# ChargeItem

The resource ChargeItem describes the provision of healthcare provider products for a certain patient, therefore
referring not only to the product, but containing in addition details of the provision, like date, time, amounts and
participating organizations and persons. Main Usage of the ChargeItem is to enable the billing process and internal cost
allocation.

## Properties

| Name                   | Card  | Type            | Description                                                                             |
| ---------------------- | ----- | --------------- | --------------------------------------------------------------------------------------- |
| id                     | 0..1  | string          | Logical id of this artifact                                                             |
| meta                   | 0..1  | Meta            | Metadata about the resource                                                             |
| implicitRules          | 0..1  | uri             | A set of rules under which this content was created                                     |
| language               | 0..1  | code            | Language of the resource content                                                        |
| text                   | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                  |
| contained              | 0..\* | Resource        | Contained, inline Resources                                                             |
| extension              | 0..\* | Extension       | Additional content defined by implementations                                           |
| modifierExtension      | 0..\* | Extension       | Extensions that cannot be ignored                                                       |
| identifier             | 0..\* | Identifier      | Business Identifier for item                                                            |
| definitionUri          | 0..\* | uri             | Defining information about the code of this charge item                                 |
| definitionCanonical    | 0..\* | canonical       | Resource defining the code of this ChargeItem                                           |
| status                 | 1..1  | code            | planned \| billable \| not-billable \| aborted \| billed \| entered-in-error \| unknown |
| partOf                 | 0..\* | Reference       | Part of referenced ChargeItem                                                           |
| code                   | 1..1  | CodeableConcept | A code that identifies the charge, like a billing code                                  |
| subject                | 1..1  | Reference       | Individual service was done for/to                                                      |
| context                | 0..1  | Reference       | Encounter / Episode associated with event                                               |
| occurrence[x]          | 0..1  | dateTime        | When the charged service was applied                                                    |
| performer              | 0..\* | BackboneElement | Who performed charged service                                                           |
| performingOrganization | 0..1  | Reference       | Organization providing the charged service                                              |
| requestingOrganization | 0..1  | Reference       | Organization requesting the charged service                                             |
| costCenter             | 0..1  | Reference       | Organization that has ownership of the (potential, future) revenue                      |
| quantity               | 0..1  | Quantity        | Quantity of which the charge item has been serviced                                     |
| bodysite               | 0..\* | CodeableConcept | Anatomical location, if relevant                                                        |
| factorOverride         | 0..1  | decimal         | Factor overriding the associated rules                                                  |
| priceOverride          | 0..1  | Money           | Price overriding the associated rules                                                   |
| overrideReason         | 0..1  | string          | Reason for overriding the list price/factor                                             |
| enterer                | 0..1  | Reference       | Individual who was entering                                                             |
| enteredDate            | 0..1  | dateTime        | Date the charge item was entered                                                        |
| reason                 | 0..\* | CodeableConcept | Why was the charged service rendered?                                                   |
| service                | 0..\* | Reference       | Which rendered service is being charged?                                                |
| product[x]             | 0..1  | Reference       | Product charged                                                                         |
| account                | 0..\* | Reference       | Account to place this charge                                                            |
| note                   | 0..\* | Annotation      | Comments made about the ChargeItem                                                      |
| supportingInformation  | 0..\* | Reference       | Further information supporting this charge                                              |

## Search Parameters

| Name                    | Type      | Description                                            | Expression                        |
| ----------------------- | --------- | ------------------------------------------------------ | --------------------------------- |
| account                 | reference | Account to place this charge                           | ChargeItem.account                |
| code                    | token     | A code that identifies the charge, like a billing code | ChargeItem.code                   |
| context                 | reference | Encounter / Episode associated with event              | ChargeItem.context                |
| entered-date            | date      | Date the charge item was entered                       | ChargeItem.enteredDate            |
| enterer                 | reference | Individual who was entering                            | ChargeItem.enterer                |
| factor-override         | number    | Factor overriding the associated rules                 | ChargeItem.factorOverride         |
| identifier              | token     | Business Identifier for item                           | ChargeItem.identifier             |
| occurrence              | date      | When the charged service was applied                   | ChargeItem.occurrence             |
| patient                 | reference | Individual service was done for/to                     | ChargeItem.subject                |
| performer-actor         | reference | Individual who was performing                          | ChargeItem.performer.actor        |
| performer-function      | token     | What type of performance was done                      | ChargeItem.performer.function     |
| performing-organization | reference | Organization providing the charged service             | ChargeItem.performingOrganization |
| price-override          | quantity  | Price overriding the associated rules                  | ChargeItem.priceOverride          |
| quantity                | quantity  | Quantity of which the charge item has been serviced    | ChargeItem.quantity               |
| requesting-organization | reference | Organization requesting the charged service            | ChargeItem.requestingOrganization |
| service                 | reference | Which rendered service is being charged?               | ChargeItem.service                |
| subject                 | reference | Individual service was done for/to                     | ChargeItem.subject                |
