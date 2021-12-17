---
title: MedicinalProductPackaged
sidebar_position: 421
---

# MedicinalProductPackaged

A medicinal product in a container or package.

## Properties

| Name                   | Card  | Type            | Description                                                                               |
| ---------------------- | ----- | --------------- | ----------------------------------------------------------------------------------------- |
| id                     | 0..1  | string          | Logical id of this artifact                                                               |
| meta                   | 0..1  | Meta            | Metadata about the resource                                                               |
| implicitRules          | 0..1  | uri             | A set of rules under which this content was created                                       |
| language               | 0..1  | code            | Language of the resource content                                                          |
| text                   | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                    |
| contained              | 0..\* | Resource        | Contained, inline Resources                                                               |
| extension              | 0..\* | Extension       | Additional content defined by implementations                                             |
| modifierExtension      | 0..\* | Extension       | Extensions that cannot be ignored                                                         |
| identifier             | 0..\* | Identifier      | Unique identifier                                                                         |
| subject                | 0..\* | Reference       | The product with this is a pack for                                                       |
| description            | 0..1  | string          | Textual description                                                                       |
| legalStatusOfSupply    | 0..1  | CodeableConcept | The legal status of supply of the medicinal product as classified by the regulator        |
| marketingStatus        | 0..\* | MarketingStatus | Marketing information                                                                     |
| marketingAuthorization | 0..1  | Reference       | Manufacturer of this Package Item                                                         |
| manufacturer           | 0..\* | Reference       | Manufacturer of this Package Item                                                         |
| batchIdentifier        | 0..\* | BackboneElement | Batch numbering                                                                           |
| packageItem            | 1..\* | BackboneElement | A packaging item, as a contained for medicine, possibly with other packaging items within |

## Search Parameters

| Name       | Type      | Description                         | Expression                          |
| ---------- | --------- | ----------------------------------- | ----------------------------------- |
| identifier | token     | Unique identifier                   | MedicinalProductPackaged.identifier |
| subject    | reference | The product with this is a pack for | MedicinalProductPackaged.subject    |
