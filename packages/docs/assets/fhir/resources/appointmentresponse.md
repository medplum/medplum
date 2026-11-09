## Usage

[Appointment](/docs/api/fhir/resources/appointment) resources are used to provide information about a planned meeting that may be in the future or past. They may be for a single meeting or for a series of repeating visits. Examples include a scheduled surgery, a follow-up for a clinical visit, a scheduled conference call between clinicians to discuss a case, the reservation of a piece of diagnostic equipment for a particular use, etc. The visit scheduled by an appointment may be in person or remote (by phone, video conference, etc.) All that matters is that the time and usage of one or more individuals, locations and/or pieces of equipment is being fully or partially reserved for a designated period of time.

This definition takes the concepts of appointments in a clinical setting and also extends them to be relevant in the community healthcare space, and also ease exposure to other appointment / calendar standards widely used outside of Healthcare.

#### The basic workflow to create an appointment[](https://www.hl7.org/fhir/appointmentresponse.html#basic-workflow 'link to here')

- **Making the [Appointment](/docs/api/fhir/resources/appointment) Request**

  When an appointment is required, a requester creates new [Appointment](/docs/api/fhir/resources/appointment) resource with the [Appointment](/docs/api/fhir/resources/appointment).status="proposed".  
  All included participants (optional or mandatory) should have the status="needs-action" to allow filtering and displaying appointments to user-participants for accepting or rejecting new and updated requests. Based on internal system business rules, certain statuses may be automatically updated, for example: "reject because the requested participant is on vacation" or "this type of user is not allowed to request those specific appointments".

- **Replying to the request**

  The reply process is simply performed by the person/system handing the requests updating the participant statuses as needed. If there are multiple systems involved, then these will create [AppointmentResponse](/docs/api/fhir/resources/appointmentresponse) entries with the desired statuses.

  Once all participants have their participation status created/updated (and the main system marking the appointment participant records with the [AppointmentResponse](/docs/api/fhir/resources/appointmentresponse) statuses) then the overall status of the [Appointment](/docs/api/fhir/resources/appointment) is updated.
