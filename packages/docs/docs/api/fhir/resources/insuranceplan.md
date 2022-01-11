---
title: InsurancePlan
sidebar_position: 333
---

# InsurancePlan

Details of a Health Insurance product/plan provided by an organization.

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
| identifier        | 0..\* | Identifier      | Business Identifier for Product                        |
| status            | 0..1  | code            | draft \| active \| retired \| unknown                  |
| type              | 0..\* | CodeableConcept | Kind of product                                        |
| name              | 0..1  | string          | Official name                                          |
| alias             | 0..\* | string          | Alternate names                                        |
| period            | 0..1  | Period          | When the product is available                          |
| ownedBy           | 0..1  | Reference       | Plan issuer                                            |
| administeredBy    | 0..1  | Reference       | Product administrator                                  |
| coverageArea      | 0..\* | Reference       | Where product applies                                  |
| contact           | 0..\* | BackboneElement | Contact for the product                                |
| endpoint          | 0..\* | Reference       | Technical endpoint                                     |
| network           | 0..\* | Reference       | What networks are Included                             |
| coverage          | 0..\* | BackboneElement | Coverage details                                       |
| plan              | 0..\* | BackboneElement | Plan details                                           |

## Search Parameters

| Name               | Type      | Description                                                                                                                                             | Expression                               |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| address            | string    | A server defined search that may match any of the string fields in the Address, including line, city, district, state, country, postalCode, and/or text | InsurancePlan.contact.address            |
| address-city       | string    | A city specified in an address                                                                                                                          | InsurancePlan.contact.address.city       |
| address-country    | string    | A country specified in an address                                                                                                                       | InsurancePlan.contact.address.country    |
| address-postalcode | string    | A postal code specified in an address                                                                                                                   | InsurancePlan.contact.address.postalCode |
| address-state      | string    | A state specified in an address                                                                                                                         | InsurancePlan.contact.address.state      |
| address-use        | token     | A use code specified in an address                                                                                                                      | InsurancePlan.contact.address.use        |
| administered-by    | reference | Product administrator                                                                                                                                   | InsurancePlan.administeredBy             |
| endpoint           | reference | Technical endpoint                                                                                                                                      | InsurancePlan.endpoint                   |
| identifier         | token     | Any identifier for the organization (not the accreditation issuer's identifier)                                                                         | InsurancePlan.identifier                 |
| name               | string    | A portion of the organization's name or alias                                                                                                           |
| owned-by           | reference | An organization of which this organization forms a part                                                                                                 | InsurancePlan.ownedBy                    |
| phonetic           | string    | A portion of the organization's name using some kind of phonetic matching algorithm                                                                     | InsurancePlan.name                       |
| status             | token     | Is the Organization record active                                                                                                                       | InsurancePlan.status                     |
| type               | token     | A code for the type of organization                                                                                                                     | InsurancePlan.type                       |
