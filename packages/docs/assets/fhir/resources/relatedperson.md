## Usage

[RelatedPersons](/docs/api/fhir/resources/relatedperson) typically have a personal or non-healthcare-specific professional relationship to the patient. A [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource is primarily used for attribution of information, since [RelatedPersons](/docs/api/fhir/resources/relatedperson) are often a source of information about the patient. For keeping information about people for contact purposes for a patient, use a [Patient](/docs/api/fhir/resources/patient)'s Contact element. Some individuals may serve as both a [Patient](/docs/api/fhir/resources/patient)'s Contact and a Related [Person](/docs/api/fhir/resources/person).

Example [RelatedPersons](/docs/api/fhir/resources/relatedperson) are:

- A patient's wife or husband
- A patient's relatives or friends
- A neighbor bringing a patient to the hospital
- The owner or trainer of a horse
- A patient's attorney or guardian
- A Guide Dog

## Relationships

The primary distinction between a [Practitioner](/docs/api/fhir/resources/practitioner) and a [RelatedPerson](/docs/api/fhir/resources/relatedperson) is based on whether:

- The person/animal operates on behalf of the care delivery organization over multiple patients (Practitioner) or,
- Where the person/animal is not associated with the organization, and instead is allocated tasks specifically for the [RelatedPerson](/docs/api/fhir/resources/relatedperson)'s [Patient](/docs/api/fhir/resources/patient) (RelatedPerson).

A standard extension [animalSpecies](https://www.hl7.org/fhir/extension-practitioner-animalspecies.html) can be used to indicate the species of a service animal.
