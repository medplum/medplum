---
title: Schedule
sidebar_position: 531
---

# Schedule

A container for slots of time that may be available for booking appointments.

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
| identifier | 0..* | Identifier | External Ids for this item
| active | 0..1 | boolean | Whether this schedule is in active use
| serviceCategory | 0..* | CodeableConcept | High-level category
| serviceType | 0..* | CodeableConcept | Specific service
| specialty | 0..* | CodeableConcept | Type of specialty needed
| actor | 1..* | Reference | Resource(s) that availability information is being provided for
| planningHorizon | 0..1 | Period | Period of time covered by schedule
| comment | 0..1 | string | Comments on availability

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| active | token | Is the schedule in active use | Schedule.active
| actor | reference | The individual(HealthcareService, Practitioner, Location, ...) to find a Schedule for | Schedule.actor
| date | date | Search for Schedule resources that have a period that contains this date specified | Schedule.planningHorizon
| identifier | token | A Schedule Identifier | Schedule.identifier
| service-category | token | High-level category | Schedule.serviceCategory
| service-type | token | The type of appointments that can be booked into associated slot(s) | Schedule.serviceType
| specialty | token | Type of specialty needed | Schedule.specialty

