---
title: SupplyDelivery
sidebar_position: 600
---

# SupplyDelivery

Record of delivery of what is supplied.

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
| identifier | 0..* | Identifier | External identifier
| basedOn | 0..* | Reference | Fulfills plan, proposal or order
| partOf | 0..* | Reference | Part of referenced event
| status | 0..1 | code | in-progress \| completed \| abandoned \| entered-in-error
| patient | 0..1 | Reference | Patient for whom the item is supplied
| type | 0..1 | CodeableConcept | Category of dispense event
| suppliedItem | 0..1 | BackboneElement | The item that is delivered or supplied
| occurrence[x] | 0..1 | dateTime | When event occurred
| supplier | 0..1 | Reference | Dispenser
| destination | 0..1 | Reference | Where the Supply was sent
| receiver | 0..* | Reference | Who collected the Supply

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| identifier | token | External identifier | SupplyDelivery.identifier
| patient | reference | Patient for whom the item is supplied | SupplyDelivery.patient
| receiver | reference | Who collected the Supply | SupplyDelivery.receiver
| status | token | in-progress \| completed \| abandoned \| entered-in-error | SupplyDelivery.status
| supplier | reference | Dispenser | SupplyDelivery.supplier

