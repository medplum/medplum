# Scheduling

Scheduling is a common workflow and correct use of the FHIR spec supports many complex scheduling workflows. Scheduling workflows include a [Schedule](../api/fhir/resources/schedule.mdx) which has one more more [Slots](../api/fhir/resources/slot.mdx), in which [Appointments](../api/fhir/resources/appointment.mdx) are made.

More advanced workflows can include [AppointmentResponse](../api/fhir/resources/appointmentresponse.mdx) and can have requirements for [Location](../api/fhir/resources/location.mdx), or other business logic enforcement.

- [Scheduling Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Ascheduling) on Github, with sample data included.
- [Schedules](https://app.medplum.com/Schedule) on the Medplum App
- [Scheduling React Component](https://storybook.medplum.com/?path=/docs/medplum-scheduler--basic)
