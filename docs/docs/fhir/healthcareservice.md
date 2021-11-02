---
title: HealthcareService
sidebar_position: 304
---

# HealthcareService

The details of a healthcare service available at a location.

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
| identifier | 0..* | Identifier | External identifiers for this item
| active | 0..1 | boolean | Whether this HealthcareService record is in active use
| providedBy | 0..1 | Reference | Organization that provides this service
| category | 0..* | CodeableConcept | Broad category of service being performed or delivered
| type | 0..* | CodeableConcept | Type of service that may be delivered or performed
| specialty | 0..* | CodeableConcept | Specialties handled by the HealthcareService
| location | 0..* | Reference | Location(s) where service may be provided
| name | 0..1 | string | Description of service as presented to a consumer while searching
| comment | 0..1 | string | Additional description and/or any specific issues not covered elsewhere
| extraDetails | 0..1 | markdown | Extra details about the service that can't be placed in the other fields
| photo | 0..1 | Attachment | Facilitates quick identification of the service
| telecom | 0..* | ContactPoint | Contacts related to the healthcare service
| coverageArea | 0..* | Reference | Location(s) service is intended for/available to
| serviceProvisionCode | 0..* | CodeableConcept | Conditions under which service is available/offered
| eligibility | 0..* | BackboneElement | Specific eligibility requirements required to use the service
| program | 0..* | CodeableConcept | Programs that this service is applicable to
| characteristic | 0..* | CodeableConcept | Collection of characteristics (attributes)
| communication | 0..* | CodeableConcept | The language that this service is offered in
| referralMethod | 0..* | CodeableConcept | Ways that the service accepts referrals
| appointmentRequired | 0..1 | boolean | If an appointment is required for access to this service
| availableTime | 0..* | BackboneElement | Times the Service Site is available
| notAvailable | 0..* | BackboneElement | Not available during this time due to provided reason
| availabilityExceptions | 0..1 | string | Description of availability exceptions
| endpoint | 0..* | Reference | Technical endpoints providing access to electronic services operated for the healthcare service

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| active | token | The Healthcare Service is currently marked as active | HealthcareService.active
| characteristic | token | One of the HealthcareService's characteristics | HealthcareService.characteristic
| coverage-area | reference | Location(s) service is intended for/available to | HealthcareService.coverageArea
| endpoint | reference | Technical endpoints providing access to electronic services operated for the healthcare service | HealthcareService.endpoint
| identifier | token | External identifiers for this item | HealthcareService.identifier
| location | reference | The location of the Healthcare Service | HealthcareService.location
| name | string | A portion of the Healthcare service name | HealthcareService.name
| organization | reference | The organization that provides this Healthcare Service | HealthcareService.providedBy
| program | token | One of the Programs supported by this HealthcareService | HealthcareService.program
| service-category | token | Service Category of the Healthcare Service | HealthcareService.category
| service-type | token | The type of service provided by this healthcare service | HealthcareService.type
| specialty | token | The specialty of the service provided by this healthcare service | HealthcareService.specialty

