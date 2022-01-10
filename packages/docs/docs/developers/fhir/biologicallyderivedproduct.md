---
title: BiologicallyDerivedProduct
sidebar_position: 79
---

# BiologicallyDerivedProduct

A material substance originating from a biological entity intended to be transplanted or infused
into another (possibly the same) biological entity.

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
| identifier        | 0..\* | Identifier      | External ids for this item                             |
| productCategory   | 0..1  | code            | organ \| tissue \| fluid \| cells \| biologicalAgent   |
| productCode       | 0..1  | CodeableConcept | What this biologically derived product is              |
| status            | 0..1  | code            | available \| unavailable                               |
| request           | 0..\* | Reference       | Procedure request                                      |
| quantity          | 0..1  | integer         | The amount of this biologically derived product        |
| parent            | 0..\* | Reference       | BiologicallyDerivedProduct parent                      |
| collection        | 0..1  | BackboneElement | How this product was collected                         |
| processing        | 0..\* | BackboneElement | Any processing of the product during collection        |
| manipulation      | 0..1  | BackboneElement | Any manipulation of product post-collection            |
| storage           | 0..\* | BackboneElement | Product storage                                        |

## Search Parameters

| Name | Type | Description | Expression |
| ---- | ---- | ----------- | ---------- |
