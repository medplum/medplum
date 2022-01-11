---
title: AppointmentResponse
sidebar_position: 70
---

# AppointmentResponse

A reply to an appointment request for a patient and/or practitioner(s), such as a confirmation or rejection.

## Properties

| Name              | Card  | Type            | Description                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                            |
| meta              | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created    |
| language          | 0..1  | code            | Language of the resource content                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource        | Contained, inline Resources                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                      |
| identifier        | 0..\* | Identifier      | External Ids for this item                             |
| appointment       | 1..1  | Reference       | Appointment this response relates to                   |
| start             | 0..1  | instant         | Time from appointment, or requested new start time     |
| end               | 0..1  | instant         | Time from appointment, or requested new end time       |
| participantType   | 0..\* | CodeableConcept | Role of participant in the appointment                 |
| actor             | 0..1  | Reference       | Person, Location, HealthcareService, or Device         |
| participantStatus | 1..1  | code            | accepted \| declined \| tentative \| needs-action      |
| comment           | 0..1  | string          | Additional comments                                    |

## Search Parameters

| Name         | Type      | Description                                                                                 | Expression                            |
| ------------ | --------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| actor        | reference | The Person, Location/HealthcareService or Device that this appointment response replies for | AppointmentResponse.actor             |
| appointment  | reference | The appointment that the response is attached to                                            | AppointmentResponse.appointment       |
| identifier   | token     | An Identifier in this appointment response                                                  | AppointmentResponse.identifier        |
| location     | reference | This Response is for this Location                                                          | AppointmentResponse.actor             |
| part-status  | token     | The participants acceptance status for this appointment                                     | AppointmentResponse.participantStatus |
| patient      | reference | This Response is for this Patient                                                           | AppointmentResponse.actor             |
| practitioner | reference | This Response is for this Practitioner                                                      | AppointmentResponse.actor             |
