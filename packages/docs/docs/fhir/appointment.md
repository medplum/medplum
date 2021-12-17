---
title: Appointment
sidebar_position: 68
---

# Appointment

A booking of a healthcare event among patient(s), practitioner(s), related person(s) and/or device(s) for a specific
date/time. This may result in one or more Encounter(s).

## Properties

| Name                  | Card  | Type            | Description                                                                                                                |
| --------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| id                    | 0..1  | string          | Logical id of this artifact                                                                                                |
| meta                  | 0..1  | Meta            | Metadata about the resource                                                                                                |
| implicitRules         | 0..1  | uri             | A set of rules under which this content was created                                                                        |
| language              | 0..1  | code            | Language of the resource content                                                                                           |
| text                  | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                                     |
| contained             | 0..\* | Resource        | Contained, inline Resources                                                                                                |
| extension             | 0..\* | Extension       | Additional content defined by implementations                                                                              |
| modifierExtension     | 0..\* | Extension       | Extensions that cannot be ignored                                                                                          |
| identifier            | 0..\* | Identifier      | External Ids for this item                                                                                                 |
| status                | 1..1  | code            | proposed \| pending \| booked \| arrived \| fulfilled \| cancelled \| noshow \| entered-in-error \| checked-in \| waitlist |
| cancelationReason     | 0..1  | CodeableConcept | The coded reason for the appointment being cancelled                                                                       |
| serviceCategory       | 0..\* | CodeableConcept | A broad categorization of the service that is to be performed during this appointment                                      |
| serviceType           | 0..\* | CodeableConcept | The specific service that is to be performed during this appointment                                                       |
| specialty             | 0..\* | CodeableConcept | The specialty of a practitioner that would be required to perform the service requested in this appointment                |
| appointmentType       | 0..1  | CodeableConcept | The style of appointment or patient that has been booked in the slot (not service type)                                    |
| reasonCode            | 0..\* | CodeableConcept | Coded reason this appointment is scheduled                                                                                 |
| reasonReference       | 0..\* | Reference       | Reason the appointment is to take place (resource)                                                                         |
| priority              | 0..1  | unsignedInt     | Used to make informed decisions if needing to re-prioritize                                                                |
| description           | 0..1  | string          | Shown on a subject line in a meeting request, or appointment list                                                          |
| supportingInformation | 0..\* | Reference       | Additional information to support the appointment                                                                          |
| start                 | 0..1  | instant         | When appointment is to take place                                                                                          |
| end                   | 0..1  | instant         | When appointment is to conclude                                                                                            |
| minutesDuration       | 0..1  | positiveInt     | Can be less than start/end (e.g. estimate)                                                                                 |
| slot                  | 0..\* | Reference       | The slots that this appointment is filling                                                                                 |
| created               | 0..1  | dateTime        | The date that this appointment was initially created                                                                       |
| comment               | 0..1  | string          | Additional comments                                                                                                        |
| patientInstruction    | 0..1  | string          | Detailed information and instructions for the patient                                                                      |
| basedOn               | 0..\* | Reference       | The service request this appointment is allocated to assess                                                                |
| participant           | 1..\* | BackboneElement | Participants involved in appointment                                                                                       |
| requestedPeriod       | 0..\* | Period          | Potential date/time interval(s) requested to allocate the appointment within                                               |

## Search Parameters

| Name             | Type      | Description                                                                                                                                                       | Expression                        |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| actor            | reference | Any one of the individuals participating in the appointment                                                                                                       | Appointment.participant.actor     |
| appointment-type | token     | The style of appointment or patient that has been booked in the slot (not service type)                                                                           | Appointment.appointmentType       |
| based-on         | reference | The service request this appointment is allocated to assess                                                                                                       | Appointment.basedOn               |
| date             | date      | Appointment date/time.                                                                                                                                            | Appointment.start                 |
| identifier       | token     | An Identifier of the Appointment                                                                                                                                  | Appointment.identifier            |
| location         | reference | This location is listed in the participants of the appointment                                                                                                    | Appointment.participant.actor     |
| part-status      | token     | The Participation status of the subject, or other participant on the appointment. Can be used to locate participants that have not responded to meeting requests. | Appointment.participant.status    |
| patient          | reference | One of the individuals of the appointment is this patient                                                                                                         | Appointment.participant.actor     |
| practitioner     | reference | One of the individuals of the appointment is this practitioner                                                                                                    | Appointment.participant.actor     |
| reason-code      | token     | Coded reason this appointment is scheduled                                                                                                                        | Appointment.reasonCode            |
| reason-reference | reference | Reason the appointment is to take place (resource)                                                                                                                | Appointment.reasonReference       |
| service-category | token     | A broad categorization of the service that is to be performed during this appointment                                                                             | Appointment.serviceCategory       |
| service-type     | token     | The specific service that is to be performed during this appointment                                                                                              | Appointment.serviceType           |
| slot             | reference | The slots that this appointment is filling                                                                                                                        | Appointment.slot                  |
| specialty        | token     | The specialty of a practitioner that would be required to perform the service requested in this appointment                                                       | Appointment.specialty             |
| status           | token     | The overall status of the appointment                                                                                                                             | Appointment.status                |
| supporting-info  | reference | Additional information to support the appointment                                                                                                                 | Appointment.supportingInformation |
