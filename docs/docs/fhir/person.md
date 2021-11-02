---
title: Person
sidebar_position: 481
---

# Person

Demographics and administrative information about a person independent of a specific health-related context.

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
| identifier | 0..* | Identifier | A human identifier for this person
| name | 0..* | HumanName | A name associated with the person
| telecom | 0..* | ContactPoint | A contact detail for the person
| gender | 0..1 | code | male \| female \| other \| unknown
| birthDate | 0..1 | date | The date on which the person was born
| address | 0..* | Address | One or more addresses for the person
| photo | 0..1 | Attachment | Image of the person
| managingOrganization | 0..1 | Reference | The organization that is the custodian of the person record
| active | 0..1 | boolean | This person's record is in active use
| link | 0..* | BackboneElement | Link to a resource that concerns the same actual person

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| address | string | A server defined search that may match any of the string fields in the Address, including line, city, district, state, country, postalCode, and/or text | Person.address
| address-city | string | A city specified in an address | Person.address.city
| address-country | string | A country specified in an address | Person.address.country
| address-postalcode | string | A postal code specified in an address | Person.address.postalCode
| address-state | string | A state specified in an address | Person.address.state
| address-use | token | A use code specified in an address | Person.address.use
| birthdate | date | The person's date of birth | Person.birthDate
| email | token | A value in an email contact | Person.telecom
| gender | token | The gender of the person | Person.gender
| phone | token | A value in a phone contact | Person.telecom
| phonetic | string | A portion of name using some kind of phonetic matching algorithm | Person.name
| telecom | token | The value in any kind of contact | Person.telecom
| identifier | token | A person Identifier | Person.identifier
| link | reference | Any link has this Patient, Person, RelatedPerson or Practitioner reference | Person.link.target
| name | string | A server defined search that may match any of the string fields in the HumanName, including family, give, prefix, suffix, suffix, and/or text | Person.name
| organization | reference | The organization at which this person record is being managed | Person.managingOrganization
| patient | reference | The Person links to this Patient | Person.link.target
| practitioner | reference | The Person links to this Practitioner | Person.link.target
| relatedperson | reference | The Person links to this RelatedPerson | Person.link.target

