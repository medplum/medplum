---
title: PractitionerRole
sidebar_position: 493
---

# PractitionerRole

A specific set of Roles/Locations/specialties/services that a practitioner may perform at an organization for a period of time.

## Properties

| Name                   | Card  | Type            | Description                                                                                        |
| ---------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------- |
| id                     | 0..1  | string          | Logical id of this artifact                                                                        |
| meta                   | 0..1  | Meta            | Metadata about the resource                                                                        |
| implicitRules          | 0..1  | uri             | A set of rules under which this content was created                                                |
| language               | 0..1  | code            | Language of the resource content                                                                   |
| text                   | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                             |
| contained              | 0..\* | Resource        | Contained, inline Resources                                                                        |
| extension              | 0..\* | Extension       | Additional content defined by implementations                                                      |
| modifierExtension      | 0..\* | Extension       | Extensions that cannot be ignored                                                                  |
| identifier             | 0..\* | Identifier      | Business Identifiers that are specific to a role/location                                          |
| active                 | 0..1  | boolean         | Whether this practitioner role record is in active use                                             |
| period                 | 0..1  | Period          | The period during which the practitioner is authorized to perform in these role(s)                 |
| practitioner           | 0..1  | Reference       | Practitioner that is able to provide the defined services for the organization                     |
| organization           | 0..1  | Reference       | Organization where the roles are available                                                         |
| code                   | 0..\* | CodeableConcept | Roles which this practitioner may perform                                                          |
| specialty              | 0..\* | CodeableConcept | Specific specialty of the practitioner                                                             |
| location               | 0..\* | Reference       | The location(s) at which this practitioner provides care                                           |
| healthcareService      | 0..\* | Reference       | The list of healthcare services that this worker provides for this role's Organization/Location(s) |
| telecom                | 0..\* | ContactPoint    | Contact details that are specific to the role/location/service                                     |
| availableTime          | 0..\* | BackboneElement | Times the Service Site is available                                                                |
| notAvailable           | 0..\* | BackboneElement | Not available during this time due to provided reason                                              |
| availabilityExceptions | 0..1  | string          | Description of availability exceptions                                                             |
| endpoint               | 0..\* | Reference       | Technical endpoints providing access to services operated for the practitioner with this role      |

## Search Parameters

| Name         | Type      | Description                                                                                        | Expression                         |
| ------------ | --------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| email        | token     | A value in an email contact                                                                        | PractitionerRole.telecom           |
| phone        | token     | A value in a phone contact                                                                         | PractitionerRole.telecom           |
| telecom      | token     | The value in any kind of contact                                                                   | PractitionerRole.telecom           |
| active       | token     | Whether this practitioner role record is in active use                                             | PractitionerRole.active            |
| date         | date      | The period during which the practitioner is authorized to perform in these role(s)                 | PractitionerRole.period            |
| endpoint     | reference | Technical endpoints providing access to services operated for the practitioner with this role      | PractitionerRole.endpoint          |
| identifier   | token     | A practitioner's Identifier                                                                        | PractitionerRole.identifier        |
| location     | reference | One of the locations at which this practitioner provides care                                      | PractitionerRole.location          |
| organization | reference | The identity of the organization the practitioner represents / acts on behalf of                   | PractitionerRole.organization      |
| practitioner | reference | Practitioner that is able to provide the defined services for the organization                     | PractitionerRole.practitioner      |
| role         | token     | The practitioner can perform this role at for the organization                                     | PractitionerRole.code              |
| service      | reference | The list of healthcare services that this worker provides for this role's Organization/Location(s) | PractitionerRole.healthcareService |
| specialty    | token     | The practitioner has this specialty at an organization                                             | PractitionerRole.specialty         |
