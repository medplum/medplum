## Usage

[Schedule](/docs/api/fhir/resources/schedule) resources provide a container for time-slots that can be booked using an appointment. It provides the window of time (period) that slots are defined for and what type of appointments can be booked.  
The schedule does not provide any information about actual appointments. This separation greatly assists where access to the appointments would not be permitted for security or privacy reasons, while still being able to determine if an appointment might be available.

Note: A schedule is not used for the delivery of medication, the [Timing](https://hl7.org/fhir/datatypes.html#Timing) data type should be used for that purpose.

#### Context[](https://www.hl7.org/fhir/schedule.html#12.12.1.1 'link to here')

A schedule controls the dates and times available for the performance of a service and/or the use of a resource. One schedule applies to one service or resource, since each service or resource can be reserved independently of the others.  
If two or more services, people, locations, or things cannot be reserved independently of one another, they are considered to be one activity or resource.

A schedule consists of slots of time during which the controlled service or resource is potentially available for provision or use. [Slots](/docs/api/fhir/resources/slot) are categorized as open, booked, or blocked. An open slot on a schedule indicates that the service or resource is available for provision or use during that period of time. A booked slot indicates that the service or resource is not available during the time period, because an appointment has been scheduled. A blocked slot indicates that a service or resource is unavailable for reasons other than a scheduled appointment.

The real-world, non-automated analogue of the schedule described above is a standard appointment book. These books are generally organized with rows of time slots, during which a service or resource is available.

A slot is one unit on a schedule. A slot represents the smallest unit of time or quantity that a service or resource may be booked. Depending on the nature of the service or resource, there may be more than one defined slot at a given instant of time. For example, if a service is an open group therapy session with twelve available seats, then there are twelve slots for the given block of time.

#### Actor - What the schedule applies to[](https://www.hl7.org/fhir/schedule.html#12.12.1.2 'link to here')

The schedule belongs to a single instance of a service or resource. This is normally a [HealthcareService](/docs/api/fhir/resources/healthcareservice), [Practitioner](/docs/api/fhir/resources/practitioner), [Location](/docs/api/fhir/resources/location) or [Device](/docs/api/fhir/resources/device). In the case where a single resource can provide different services, potentially at different location, then the schedulable resource is considered the composite of the actors.  
For example, if a practitioner can provide services at multiple locations, they might have one schedule per location, where each schedule includes both the practitioner and location actors. When booking an appointment with multiple schedulable resources, multiple schedules may need to be checked depending on the configuration of the system.

If an appointment has two practitioners, a specific medical device and a room then there could be a schedule for each of these resources that may need to be consulted to ensure that no collisions occur.  
If the schedule needed to be consulted, then there would be one created covering the planning horizon for the time of the appointment.

#### Checking availability - Searching[](https://www.hl7.org/fhir/schedule.html#12.12.1.3 'link to here')

When checking availability for an appointment, the creator of the appointment should determine which schedules are applicable, then check for available slots within each schedule.

Determining which schedules should be consulted often will involve searching via the properties of the referenced actors, such as the ServiceCategory on the [HealthcareService](/docs/api/fhir/resources/healthcareservice), or the [Address](/docs/api/fhir/datatypes/address) on a [Location](/docs/api/fhir/resources/location).

The type parameter can be used to filter the type of services that can be booked within the associated slots.

If all slots are busy, the caller may attempt to book an appointment into an already-booked slot, but the server business rules will dictate whether overbooking is allowed, or whether the appointment may be given a higher precedence and allocated the overbooked slot.
