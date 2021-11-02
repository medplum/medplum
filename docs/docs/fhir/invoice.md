---
title: Invoice
sidebar_position: 343
---

# Invoice

Invoice containing collected ChargeItems from an Account with calculated individual and total price for Billing purpose.

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
| identifier | 0..* | Identifier | Business Identifier for item
| status | 1..1 | code | draft \| issued \| balanced \| cancelled \| entered-in-error
| cancelledReason | 0..1 | string | Reason for cancellation of this Invoice
| type | 0..1 | CodeableConcept | Type of Invoice
| subject | 0..1 | Reference | Recipient(s) of goods and services
| recipient | 0..1 | Reference | Recipient of this invoice
| date | 0..1 | dateTime | Invoice date / posting date
| participant | 0..* | BackboneElement | Participant in creation of this Invoice
| issuer | 0..1 | Reference | Issuing Organization of Invoice
| account | 0..1 | Reference | Account that is being balanced
| lineItem | 0..* | BackboneElement | Line items of this Invoice
| totalPriceComponent | 0..* |  | Components of Invoice total
| totalNet | 0..1 | Money | Net total of this Invoice
| totalGross | 0..1 | Money | Gross total of this Invoice
| paymentTerms | 0..1 | markdown | Payment details
| note | 0..* | Annotation | Comments made about the invoice

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| account | reference | Account that is being balanced | Invoice.account
| date | date | Invoice date / posting date | Invoice.date
| identifier | token | Business Identifier for item | Invoice.identifier
| issuer | reference | Issuing Organization of Invoice | Invoice.issuer
| participant | reference | Individual who was involved | Invoice.participant.actor
| participant-role | token | Type of involvement in creation of this Invoice | Invoice.participant.role
| patient | reference | Recipient(s) of goods and services | Invoice.subject
| recipient | reference | Recipient of this invoice | Invoice.recipient
| status | token | draft \| issued \| balanced \| cancelled \| entered-in-error | Invoice.status
| subject | reference | Recipient(s) of goods and services | Invoice.subject
| totalgross | quantity | Gross total of this Invoice | Invoice.totalGross
| totalnet | quantity | Net total of this Invoice | Invoice.totalNet
| type | token | Type of Invoice | Invoice.type

