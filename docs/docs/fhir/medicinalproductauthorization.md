---
title: MedicinalProductAuthorization
sidebar_position: 406
---

# MedicinalProductAuthorization

The regulatory authorization of a medicinal product.

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
| identifier | 0..* | Identifier | Business identifier for the marketing authorization, as assigned by a regulator
| subject | 0..1 | Reference | The medicinal product that is being authorized
| country | 0..* | CodeableConcept | The country in which the marketing authorization has been granted
| jurisdiction | 0..* | CodeableConcept | Jurisdiction within a country
| status | 0..1 | CodeableConcept | The status of the marketing authorization
| statusDate | 0..1 | dateTime | The date at which the given status has become applicable
| restoreDate | 0..1 | dateTime | The date when a suspended the marketing or the marketing authorization of the product is anticipated to be restored
| validityPeriod | 0..1 | Period | The beginning of the time period in which the marketing authorization is in the
  specific status shall be specified A complete date consisting of day, month and year shall be specified using the ISO
  8601 date format
| dataExclusivityPeriod | 0..1 | Period | A period of time after authorization before generic product applicatiosn can be submitted
| dateOfFirstAuthorization | 0..1 | dateTime | The date when the first authorization was granted by a Medicines Regulatory Agency
| internationalBirthDate | 0..1 | dateTime | Date of first marketing authorization for a company's new medicinal product in any country in the World
| legalBasis | 0..1 | CodeableConcept | The legal framework against which this authorization is granted
| jurisdictionalAuthorization | 0..* | BackboneElement | Authorization in areas within a country
| holder | 0..1 | Reference | Marketing Authorization Holder
| regulator | 0..1 | Reference | Medicines Regulatory Agency
| procedure | 0..1 | BackboneElement | The regulatory procedure for granting or amending a marketing authorization

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| country | token | The country in which the marketing authorization has been granted | MedicinalProductAuthorization.country
| holder | reference | Marketing Authorization Holder | MedicinalProductAuthorization.holder
| identifier | token | Business identifier for the marketing authorization, as assigned by a regulator | MedicinalProductAuthorization.identifier
| status | token | The status of the marketing authorization | MedicinalProductAuthorization.status
| subject | reference | The medicinal product that is being authorized | MedicinalProductAuthorization.subject

