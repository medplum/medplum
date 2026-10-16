## Usage

[Appointment](/docs/api/fhir/resources/appointment) resources are used to provide information about a planned meeting that may be in the future or past. The resource only describes a single meeting, a series of repeating visits would require multiple appointment resources to be created for each instance. Examples include a scheduled surgery, a follow-up for a clinical visit, a scheduled conference call between clinicians to discuss a case, the reservation of a piece of diagnostic equipment for a particular use, etc. The visit scheduled by an appointment may be in person or remote (by phone, video conference, etc.) All that matters is that the time and usage of one or more individuals, locations and/or pieces of equipment is being fully or partially reserved for a designated period of time.

This definition takes the concepts of appointments in a clinical setting and also extends them to be relevant in the community healthcare space, and to ease exposure to other appointment / calendar standards widely used outside of healthcare.

#### The basic workflow to create an appointment[](https://www.hl7.org/fhir/appointment.html#basic-workflow 'link to here')

- **Discovery/Addressing**

  Before an appointment can be made, the address/endpoint details of the resource that we want to schedule an appointment with must be determined. This is often based on the healthcare service type and any formatting information which indicates how to make the request. This is typically handled via the [Schedule](/docs/api/fhir/resources/schedule) resource.

- **Checking Availability on the [Schedule](/docs/api/fhir/resources/schedule) (optional)**

  This optional step permits the checking of any existing available times ([Slot](/docs/api/fhir/resources/slot) resources associated with a selected [Schedule](/docs/api/fhir/resources/schedule)) that can be booked against. Just because a time is indicated as available doesn't guarantee that an appointment can be made. The booking system that is going to process the request may make other qualifying decisions to determine if the appointment can be made, such as permissions, assessments, availability of other resources, etc.

  This step is optional, as the creation of the appointment is never a guaranteed action. But by performing this availability check, you can increase the chances of making a successful booking.

- **Making the [Appointment](/docs/api/fhir/resources/appointment) Request**

  When an appointment is required, a requester creates new [Appointment](/docs/api/fhir/resources/appointment) resource with the [Appointment](/docs/api/fhir/resources/appointment).status="proposed".  
  All included participants (optional or mandatory) should have the status="needs-action" to allow filtering and displaying appointments to user-participants for accepting or rejecting new and updated requests. Based on internal system business rules, certain statuses may be automatically updated, for example: "reject because the requested participant is on vacation" or "this type of user is not allowed to request those specific appointments".

- **Replying to the request**

  The reply process is simply performed by the person/system handing the requests, updating the participant statuses on the appointment as needed. If there are multiple systems involved, then these will create [AppointmentResponse](/docs/api/fhir/resources/appointmentresponse) entries with the desired statuses.

  Once all participants have their participation status created/updated (and the main system marking the appointment participant records with the [AppointmentResponse](/docs/api/fhir/resources/appointmentresponse) statuses) then the overall status of the [Appointment](/docs/api/fhir/resources/appointment) is updated.

- **Checking the overall status (Requester)**

  The requester (organizer) of the appointment checks for the overall status of the appointment (and appointment responses, where applicable) using FHIR pub-sub techniques.

  Where the participant statuses indicate that a re-scheduling is required, then the process may start again, with other systems replying to a new set of times.

- **Waitlisting the [Appointment](/docs/api/fhir/resources/appointment) (optional)**

  This optional step permits creating a waitlisted appointment. This could occur if an appointment needs to be booked into a time that is not ideal for the patient due to lack of available time slots. In this workflow, there would be two appointments, the booked appointment in the time slot that is currently available, and the waitlisted appointment with a requestedPeriod spanning the time that the patient would prefer if new slots become available.

  If new time slots become available during the requestedPeriod, the scheduling system, or staff at the scheduling organization, can notify the patient that a new time slot is available. If the patient chooses, the waitlisted appointment would then be booked into that specific slot, and the previously booked appointment would be canceled. The specific business process for notifying patients of new availability is not specified, and is up to the implementing system to determine.

#### There are 2 typical workflows that occur with appointments[](https://www.hl7.org/fhir/appointment.html#workflow-types 'link to here')

- **Outlook Style - Community**

  These types of requests are typically handled by selecting a specific time from a list of available slots, then making the request for that timeslot.

- **Hospital Scheduling - Clinical**

  Clinical scheduling is often far more complex in its requirements and processing. Often this involves checking multiple availabilities across multiple systems and timing with other internal systems, not just those exposed by the [Slot](/docs/api/fhir/resources/slot) resources.

  Consideration should be given to situations where scheduling needs to be handled in more of a queue-like process.

  > **Implementation Note:** Note: This type of clinical appointment scheduling has not been specifically covered with this definition of the [Appointment](/docs/api/fhir/resources/appointment) resource (and other related resources), however if you would like to contribute to the modification of this resource to cover these use cases, please contact the HL7 [Patient](/docs/api/fhir/resources/patient) Administration work-group.

## Relationships

#### [Appointment](/docs/api/fhir/resources/appointment) Request/Response Pattern[](https://www.hl7.org/fhir/appointment.html#12.10.2.1 'link to here')

When using a request-response style of appointment this is done using [Appointment](/docs/api/fhir/resources/appointment) and [AppointmentResponse](/docs/api/fhir/resources/appointmentresponse) resources.  
The request is made in the form of an [Appointment](/docs/api/fhir/resources/appointment) with a proposed or pending status, and the list of actors with a participation status of "needs-action".

Participants in the appointment respond with their acceptance (or not) to the appointment by creating [AppointmentResponse](/docs/api/fhir/resources/appointmentresponse) resources.  
Once all the participants have replied, then the [Appointment](/docs/api/fhir/resources/appointment) resource is able to be updated with an overall status which collates the results of all the participants and presents the approved details of the appointment.

The participant type property can be used to represent a specific role that a practitioner is required to perform for the appointment. This could be specified without an actor when the actual practitioner is not known, and will be filled in closer to the scheduled time.  
This property must be the same between the [Appointment](/docs/api/fhir/resources/appointment)\-participant and the [AppointmentResponse](/docs/api/fhir/resources/appointmentresponse) so that the appropriate values can be allocated. If you need multiple actors of a specific type, then multiple participants with that type value are included on the appointment.

#### [Appointment](/docs/api/fhir/resources/appointment) Statuses and [Encounters](/docs/api/fhir/resources/encounter)[](/docs/api/fhir/resources/appointment 'link to here')

[Appointments](/docs/api/fhir/resources/appointment) can be considered as Administrative only, and the [Encounter](/docs/api/fhir/resources/encounter) is expected to have clinical implications.

In general, it is expected that appointments will result in the creation of an [Encounter](/docs/api/fhir/resources/encounter). The encounter is typically created when the service starts, not when the patient arrives. When the patient arrives, an appointment can be marked with a status of Arrived.

In an Emergency Room context, the appointment Resource is probably not appropriate to be used. In these cases, an [Encounter](/docs/api/fhir/resources/encounter) should be created.

The [Appointment](/docs/api/fhir/resources/appointment) request pattern used is different from the order-response pattern used elsewhere in FHIR.  
This is due to the close relationship to the iCal standard. Many non-clinical systems use generic non-health appointment systems which implement this standard, and the desire to integrate with the consumer who has no access to health based software is highly desirable.  
The mappings to the iCal standard have been provided to guide implementation of gateways between FHIR servers and iCal systems.

#### [Appointment](/docs/api/fhir/resources/appointment) [Locations](/docs/api/fhir/resources/location) and Participation[](/docs/api/fhir/resources/appointment 'link to here')

The location of the appointment is to be defined by using a participant that references a [Location](/docs/api/fhir/resources/location) or [HealthcareService](/docs/api/fhir/resources/healthcareservice) resource.  
This permits the location to also have its availability checked via a schedule and any conflicts more easily managed.
