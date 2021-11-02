---
title: Practitioner
sidebar_position: 491
---

# Practitioner

A person who is directly or indirectly involved in the provisioning of healthcare.

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
| identifier | 0..* | Identifier | An identifier for the person as this agent
| active | 0..1 | boolean | Whether this practitioner's record is in active use
| name | 0..* | HumanName | The name(s) associated with the practitioner
| telecom | 0..* | ContactPoint | A contact detail for the practitioner (that apply to all roles)
| address | 0..* | Address | Address(es) of the practitioner that are not role specific (typically home address)
| gender | 0..1 | code | male \| female \| other \| unknown
| birthDate | 0..1 | date | The date  on which the practitioner was born
| photo | 0..* | Attachment | Image of the person
| qualification | 0..* | BackboneElement | Certification, licenses, or training pertaining to the provision of care
| communication | 0..* | CodeableConcept | A language the practitioner can use in patient communication

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| address | string | A server defined search that may match any of the string fields in the Address, including line, city, district, state, country, postalCode, and/or text | Practitioner.address
| address-city | string | A city specified in an address | Practitioner.address.city
| address-country | string | A country specified in an address | Practitioner.address.country
| address-postalcode | string | A postalCode specified in an address | Practitioner.address.postalCode
| address-state | string | A state specified in an address | Practitioner.address.state
| address-use | token | A use code specified in an address | Practitioner.address.use
| email | token | A value in an email contact | Practitioner.telecom
| family | string | A portion of the family name | Practitioner.name.family
| gender | token | Gender of the practitioner | Practitioner.gender
| given | string | A portion of the given name | Practitioner.name.given
| phone | token | A value in a phone contact | Practitioner.telecom
| phonetic | string | A portion of either family or given name using some kind of phonetic matching algorithm | Practitioner.name
| telecom | token | The value in any kind of contact | Practitioner.telecom
| active | token | Whether the practitioner record is active | Practitioner.active
| communication | token | One of the languages that the practitioner can communicate with | Practitioner.communication
| identifier | token | A practitioner's Identifier | Practitioner.identifier
| name | string | A server defined search that may match any of the string fields in the HumanName, including family, give, prefix, suffix, suffix, and/or text | Practitioner.name

