---
title: Organization
sidebar_position: 468
---

# Organization

A formally or informally recognized grouping of people or organizations formed for the purpose of achieving some form of
  collective action.  Includes companies, institutions, corporations, departments, community groups, healthcare practice
  groups, payer/insurer, etc.

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
| identifier | 0..* | Identifier | Identifies this organization  across multiple systems
| active | 0..1 | boolean | Whether the organization's record is still in active use
| type | 0..* | CodeableConcept | Kind of organization
| name | 0..1 | string | Name used for the organization
| alias | 0..* | string | A list of alternate names that the organization is known as, or was known as in the past
| telecom | 0..* | ContactPoint | A contact detail for the organization
| address | 0..* | Address | An address for the organization
| partOf | 0..1 | Reference | The organization of which this organization forms a part
| contact | 0..* | BackboneElement | Contact for the organization for a certain purpose
| endpoint | 0..* | Reference | Technical endpoints providing access to services operated for the organization

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| active | token | Is the Organization record active | Organization.active
| address | string | A server defined search that may match any of the string fields in the Address, including line, city, district, state, country, postalCode, and/or text | Organization.address
| address-city | string | A city specified in an address | Organization.address.city
| address-country | string | A country specified in an address | Organization.address.country
| address-postalcode | string | A postal code specified in an address | Organization.address.postalCode
| address-state | string | A state specified in an address | Organization.address.state
| address-use | token | A use code specified in an address | Organization.address.use
| endpoint | reference | Technical endpoints providing access to services operated for the organization | Organization.endpoint
| identifier | token | Any identifier for the organization (not the accreditation issuer's identifier) | Organization.identifier
| name | string | A portion of the organization's name or alias | Organization.name
| partof | reference | An organization of which this organization forms a part | Organization.partOf
| phonetic | string | A portion of the organization's name using some kind of phonetic matching algorithm | Organization.name
| type | token | A code for the type of organization | Organization.type

