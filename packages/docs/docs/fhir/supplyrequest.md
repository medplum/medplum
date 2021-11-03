---
title: SupplyRequest
sidebar_position: 602
---

# SupplyRequest

A record of a request for a medication, substance or device used in the healthcare setting.

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
| identifier | 0..* | Identifier | Business Identifier for SupplyRequest
| status | 0..1 | code | draft \| active \| suspended +
| category | 0..1 | CodeableConcept | The kind of supply (central, non-stock, etc.)
| priority | 0..1 | code | routine \| urgent \| asap \| stat
| item[x] | 1..1 | CodeableConcept | Medication, Substance, or Device requested to be supplied
| quantity | 1..1 | Quantity | The requested amount of the item indicated
| parameter | 0..* | BackboneElement | Ordered item details
| occurrence[x] | 0..1 | dateTime | When the request should be fulfilled
| authoredOn | 0..1 | dateTime | When the request was made
| requester | 0..1 | Reference | Individual making the request
| supplier | 0..* | Reference | Who is intended to fulfill the request
| reasonCode | 0..* | CodeableConcept | The reason why the supply item was requested
| reasonReference | 0..* | Reference | The reason why the supply item was requested
| deliverFrom | 0..1 | Reference | The origin of the supply
| deliverTo | 0..1 | Reference | The destination of the supply

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | When the request was made | SupplyRequest.authoredOn
| identifier | token | Business Identifier for SupplyRequest | SupplyRequest.identifier
| category | token | The kind of supply (central, non-stock, etc.) | SupplyRequest.category
| requester | reference | Individual making the request | SupplyRequest.requester
| status | token | draft \| active \| suspended + | SupplyRequest.status
| subject | reference | The destination of the supply | SupplyRequest.deliverTo
| supplier | reference | Who is intended to fulfill the request | SupplyRequest.supplier

