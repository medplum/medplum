---
title: RelatedPerson
sidebar_position: 510
---

# RelatedPerson

Information about a person that is involved in the care for a patient, but who is not the target of healthcare, nor has
  a formal responsibility in the care process.

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
| active | 0..1 | boolean | Whether this related person's record is in active use
| patient | 1..1 | Reference | The patient this person is related to
| relationship | 0..* | CodeableConcept | The nature of the relationship
| name | 0..* | HumanName | A name associated with the person
| telecom | 0..* | ContactPoint | A contact detail for the person
| gender | 0..1 | code | male \| female \| other \| unknown
| birthDate | 0..1 | date | The date on which the related person was born
| address | 0..* | Address | Address where the related person can be contacted or visited
| photo | 0..* | Attachment | Image of the person
| period | 0..1 | Period | Period of time that this relationship is considered valid
| communication | 0..* | BackboneElement | A language which may be used to communicate with about the patient's health

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| address | string | A server defined search that may match any of the string fields in the Address, including line, city, district, state, country, postalCode, and/or text | RelatedPerson.address
| address-city | string | A city specified in an address | RelatedPerson.address.city
| address-country | string | A country specified in an address | RelatedPerson.address.country
| address-postalcode | string | A postal code specified in an address | RelatedPerson.address.postalCode
| address-state | string | A state specified in an address | RelatedPerson.address.state
| address-use | token | A use code specified in an address | RelatedPerson.address.use
| birthdate | date | The Related Person's date of birth | RelatedPerson.birthDate
| email | token | A value in an email contact | RelatedPerson.telecom
| gender | token | Gender of the related person | RelatedPerson.gender
| phone | token | A value in a phone contact | RelatedPerson.telecom
| phonetic | string | A portion of name using some kind of phonetic matching algorithm | RelatedPerson.name
| telecom | token | The value in any kind of contact | RelatedPerson.telecom
| active | token | Indicates if the related person record is active | RelatedPerson.active
| identifier | token | An Identifier of the RelatedPerson | RelatedPerson.identifier
| name | string | A server defined search that may match any of the string fields in the HumanName, including family, give, prefix, suffix, suffix, and/or text | RelatedPerson.name
| patient | reference | The patient this related person is related to | RelatedPerson.patient
| relationship | token | The relationship between the patient and the relatedperson | RelatedPerson.relationship

