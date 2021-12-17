---
title: CatalogEntry
sidebar_position: 110
---

# CatalogEntry

Catalog entries are wrappers that contextualize items included in a catalog.

## Properties

| Name                     | Card  | Type            | Description                                                                           |
| ------------------------ | ----- | --------------- | ------------------------------------------------------------------------------------- |
| id                       | 0..1  | string          | Logical id of this artifact                                                           |
| meta                     | 0..1  | Meta            | Metadata about the resource                                                           |
| implicitRules            | 0..1  | uri             | A set of rules under which this content was created                                   |
| language                 | 0..1  | code            | Language of the resource content                                                      |
| text                     | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                |
| contained                | 0..\* | Resource        | Contained, inline Resources                                                           |
| extension                | 0..\* | Extension       | Additional content defined by implementations                                         |
| modifierExtension        | 0..\* | Extension       | Extensions that cannot be ignored                                                     |
| identifier               | 0..\* | Identifier      | Unique identifier of the catalog item                                                 |
| type                     | 0..1  | CodeableConcept | The type of item - medication, device, service, protocol or other                     |
| orderable                | 1..1  | boolean         | Whether the entry represents an orderable item                                        |
| referencedItem           | 1..1  | Reference       | The item that is being defined                                                        |
| additionalIdentifier     | 0..\* | Identifier      | Any additional identifier(s) for the catalog item, in the same granularity or concept |
| classification           | 0..\* | CodeableConcept | Classification (category or class) of the item entry                                  |
| status                   | 0..1  | code            | draft \| active \| retired \| unknown                                                 |
| validityPeriod           | 0..1  | Period          | The time period in which this catalog entry is expected to be active                  |
| validTo                  | 0..1  | dateTime        | The date until which this catalog entry is expected to be active                      |
| lastUpdated              | 0..1  | dateTime        | When was this catalog last updated                                                    |
| additionalCharacteristic | 0..\* | CodeableConcept | Additional characteristics of the catalog entry                                       |
| additionalClassification | 0..\* | CodeableConcept | Additional classification of the catalog entry                                        |
| relatedEntry             | 0..\* | BackboneElement | An item that this catalog entry is related to                                         |

## Search Parameters

| Name | Type | Description | Expression |
| ---- | ---- | ----------- | ---------- |
