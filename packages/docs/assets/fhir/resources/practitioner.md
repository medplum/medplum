## Usage

[Practitioner](/docs/api/fhir/resources/practitioner) covers all individuals who are engaged in the healthcare process and healthcare-related services as part of their formal responsibilities and this Resource is used for attribution of activities and responsibilities to these individuals. [Practitioners](/docs/api/fhir/resources/practitioner) include (but are not limited to):

- physicians, dentists, pharmacists
- physician assistants, nurses, scribes
- midwives, dietitians, therapists, optometrists, paramedics
- medical technicians, laboratory scientists, prosthetic technicians, radiographers
- social workers, professional homecare providers, official volunteers
- receptionists handling patient registration
- IT personnel merging or unmerging patient records
- Service animal (e.g., ward assigned dog capable of detecting cancer in patients)

## Relationships

The Resource SHALL NOT be used for persons involved without a formal responsibility like individuals taking care for friends, relatives or neighbors. These can be registered as a [Patient](/docs/api/fhir/resources/patient)'s Contact. If performing some action or being referenced by another resource, use the [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource.

The primary distinction between a [Practitioner](/docs/api/fhir/resources/practitioner) and a [RelatedPerson](/docs/api/fhir/resources/relatedperson) is based on whether:

- The person/animal operates on behalf of the care delivery organization over multiple patients (Practitioner) or,
- Where the person/animal is not associated with the organization, and instead is allocated tasks specifically for the [RelatedPerson](/docs/api/fhir/resources/relatedperson)'s [Patient](/docs/api/fhir/resources/patient) (RelatedPerson).

A standard extension [animalSpecies](https://www.hl7.org/fhir/extension-practitioner-animalspecies.html) can be used to indicate the species of a service animal.

The [PractitionerRole](/docs/api/fhir/resources/practitionerrole) resource provides the details of roles that the practitioner is approved to perform for which organizations (and at which locations, and optionally what services too).

[Practitioners](/docs/api/fhir/resources/practitioner) are also often grouped into [CareTeams](/docs/api/fhir/resources/careteam) independently of roles, where the [CareTeam](/docs/api/fhir/resources/careteam) defines what specific role that they are fulfilling within the team, and might or might not have actual practitioner role resources created for the practitioner (and in the care team context, the organization the practitioner is representing)

## Background and Context

[Practitioner](/docs/api/fhir/resources/practitioner) performs different roles within the same or even different organizations. Depending on jurisdiction and custom, it may be necessary to maintain a specific [Practitioner](/docs/api/fhir/resources/practitioner) Resource for each such role or have a single [Practitioner](/docs/api/fhir/resources/practitioner) with multiple roles. The role can be limited to a specific period, after which authorization for this role ends. Note that the represented organization need not necessarily be the (direct) employer of a [Practitioner](/docs/api/fhir/resources/practitioner).
