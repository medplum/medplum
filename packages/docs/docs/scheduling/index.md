# Scheduling

Scheduling is a common workflow and correct use of the FHIR spec supports many complex scheduling workflows. Scheduling workflows include a [Schedule](../api/fhir/resources/schedule.mdx) which has one more more [Slots](../api/fhir/resources/slot.mdx), in which [Appointments](../api/fhir/resources/appointment.mdx) are made.

More advanced workflows can include [AppointmentResponse](../api/fhir/resources/appointmentresponse.mdx) and can have requirements for [Location](../api/fhir/resources/location.mdx), or other business logic enforcement.
