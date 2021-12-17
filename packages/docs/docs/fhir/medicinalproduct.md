---
title: MedicinalProduct
sidebar_position: 400
---

# MedicinalProduct

Detailed definition of a medicinal product, typically for uses other than direct patient care (e.g. regulatory use).

## Properties

| Name                           | Card  | Type            | Description                                                                                      |
| ------------------------------ | ----- | --------------- | ------------------------------------------------------------------------------------------------ |
| id                             | 0..1  | string          | Logical id of this artifact                                                                      |
| meta                           | 0..1  | Meta            | Metadata about the resource                                                                      |
| implicitRules                  | 0..1  | uri             | A set of rules under which this content was created                                              |
| language                       | 0..1  | code            | Language of the resource content                                                                 |
| text                           | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                           |
| contained                      | 0..\* | Resource        | Contained, inline Resources                                                                      |
| extension                      | 0..\* | Extension       | Additional content defined by implementations                                                    |
| modifierExtension              | 0..\* | Extension       | Extensions that cannot be ignored                                                                |
| identifier                     | 0..\* | Identifier      | Business identifier for this product. Could be an MPID                                           |
| type                           | 0..1  | CodeableConcept | Regulatory type, e.g. Investigational or Authorized                                              |
| domain                         | 0..1  | Coding          | If this medicine applies to human or veterinary uses                                             |
| combinedPharmaceuticalDoseForm | 0..1  | CodeableConcept | The dose form for a single part product, or combined form of a multiple part product             |
| legalStatusOfSupply            | 0..1  | CodeableConcept | The legal status of supply of the medicinal product as classified by the regulator               |
| additionalMonitoringIndicator  | 0..1  | CodeableConcept | Whether the Medicinal Product is subject to additional monitoring for regulatory reasons         |
| specialMeasures                | 0..\* | string          | Whether the Medicinal Product is subject to special measures for regulatory reasons              |
| paediatricUseIndicator         | 0..1  | CodeableConcept | If authorised for use in children                                                                |
| productClassification          | 0..\* | CodeableConcept | Allows the product to be classified by various systems                                           |
| marketingStatus                | 0..\* | MarketingStatus | Marketing status of the medicinal product, in contrast to marketing authorizaton                 |
| pharmaceuticalProduct          | 0..\* | Reference       | Pharmaceutical aspects of product                                                                |
| packagedMedicinalProduct       | 0..\* | Reference       | Package representation for the product                                                           |
| attachedDocument               | 0..\* | Reference       | Supporting documentation, typically for regulatory submission                                    |
| masterFile                     | 0..\* | Reference       | A master file for to the medicinal product (e.g. Pharmacovigilance System Master File)           |
| contact                        | 0..\* | Reference       | A product specific contact, person (in a role), or an organization                               |
| clinicalTrial                  | 0..\* | Reference       | Clinical trials or studies that this product is involved in                                      |
| name                           | 1..\* | BackboneElement | The product's name, including full name and possibly coded parts                                 |
| crossReference                 | 0..\* | Identifier      | Reference to another product, e.g. for linking authorised to investigational product             |
| manufacturingBusinessOperation | 0..\* | BackboneElement | An operation applied to the product, for manufacturing or adminsitrative purpose                 |
| specialDesignation             | 0..\* | BackboneElement | Indicates if the medicinal product has an orphan designation for the treatment of a rare disease |

## Search Parameters

| Name          | Type   | Description                                            | Expression                                     |
| ------------- | ------ | ------------------------------------------------------ | ---------------------------------------------- |
| identifier    | token  | Business identifier for this product. Could be an MPID | MedicinalProduct.identifier                    |
| name          | string | The full product name                                  | MedicinalProduct.name.productName              |
| name-language | token  | Language code for this name                            | MedicinalProduct.name.countryLanguage.language |
