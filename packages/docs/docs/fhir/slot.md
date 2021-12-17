---
title: Slot
sidebar_position: 535
---

# Slot

A slot of time on a schedule that may be available for booking appointments.

## Properties

| Name              | Card  | Type            | Description                                                                           |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                           |
| meta              | 0..1  | Meta            | Metadata about the resource                                                           |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                   |
| language          | 0..1  | code            | Language of the resource content                                                      |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                           |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                         |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                     |
| identifier        | 0..\* | Identifier      | External Ids for this item                                                            |
| serviceCategory   | 0..\* | CodeableConcept | A broad categorization of the service that is to be performed during this appointment |
| serviceType       | 0..\* | CodeableConcept | The type of appointments that can be booked into this slot (ideally this would        |

be an identifiable service - which is at a location, rather than the location itself). If provided then this overrides
the value provided on the availability resource
| specialty | 0..\* | CodeableConcept | The specialty of a practitioner that would be required to perform the service requested in this appointment
| appointmentType | 0..1 | CodeableConcept | The style of appointment or patient that may be booked in the slot (not service type)
| schedule | 1..1 | Reference | The schedule resource that this slot defines an interval of status information
| status | 1..1 | code | busy \| free \| busy-unavailable \| busy-tentative \| entered-in-error
| start | 1..1 | instant | Date/Time that the slot is to begin
| end | 1..1 | instant | Date/Time that the slot is to conclude
| overbooked | 0..1 | boolean | This slot has already been overbooked, appointments are unlikely to be accepted for this time
| comment | 0..1 | string | Comments on the slot to describe any extended information. Such as custom constraints on the slot

## Search Parameters

| Name             | Type      | Description                                                                                                 | Expression           |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| appointment-type | token     | The style of appointment or patient that may be booked in the slot (not service type)                       | Slot.appointmentType |
| identifier       | token     | A Slot Identifier                                                                                           | Slot.identifier      |
| schedule         | reference | The Schedule Resource that we are seeking a slot within                                                     | Slot.schedule        |
| service-category | token     | A broad categorization of the service that is to be performed during this appointment                       | Slot.serviceCategory |
| service-type     | token     | The type of appointments that can be booked into the slot                                                   | Slot.serviceType     |
| specialty        | token     | The specialty of a practitioner that would be required to perform the service requested in this appointment | Slot.specialty       |
| start            | date      | Appointment date/time.                                                                                      | Slot.start           |
| status           | token     | The free/busy status of the appointment                                                                     | Slot.status          |
