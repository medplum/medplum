## Usage

[PractitionerRole](/docs/api/fhir/resources/practitionerrole) covers the recording of the location and types of services that [Practitioners](/docs/api/fhir/resources/practitioner) are able to provide for an organization.

The role, specialty, [Location](/docs/api/fhir/resources/location) telecom and [HealthcareService](/docs/api/fhir/resources/healthcareservice) properties can be repeated if required in other instances of the [PractitionerRole](/docs/api/fhir/resources/practitionerrole). Some systems record a collection of service values for a single location, others record the single service and the list of locations it is available. Both are acceptable options for representing this data.  
Where availability, telecom, or other details are not the same across all healthcareservices, or locations a seperate [PractitionerRole](/docs/api/fhir/resources/practitionerrole) instance should be created.

## Relationships

Qualifications (from the [Practitioner](/docs/api/fhir/resources/practitioner) resource) do not imply a Role, but might be considered when an [Organization](/docs/api/fhir/resources/organization) allocates practitioners to roles within their organization, and could provide useful information (such as expiry information) which could need to be tracked in some situations to ensure they continue to be eligible for a specific role.

The [CareTeam](/docs/api/fhir/resources/careteam) resource is also often used to provide details of a role that a practitioner is allocated to perform, but is usually scoped to a much finer granularity of care, and often within the specific context of a [Patient](/docs/api/fhir/resources/patient), or functional role (e.g. Crisis planning team). In contrast the [PractitionerRole](/docs/api/fhir/resources/practitionerrole) is used in a more general sense to cover all the places that the practitioner is allocated to work (and specific details relevant to that role - such as a specific contact number, or electronic services endpoint).

## Background and Context

[Practitioner](/docs/api/fhir/resources/practitioner) performs different roles within the same or even different organizations. Depending on jurisdiction and custom, it may be necessary to maintain a specific [Practitioner](/docs/api/fhir/resources/practitioner) Resource for each such role or have a single [Practitioner](/docs/api/fhir/resources/practitioner) with multiple roles. The role can be limited to a specific period, after which authorization for this role ends. Note that the represented organization need not necessarily be the (direct) employer of a [Practitioner](/docs/api/fhir/resources/practitioner).
