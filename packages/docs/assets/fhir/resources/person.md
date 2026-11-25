## Usage

The [Person](/docs/api/fhir/resources/person) resource serves as a linkage resource that may provide a reference set of common demographics for an individual (human or animal) across multiple roles.  
This linkage can be direct to role-specific FHIR resources (Patient, [Practitioner](/docs/api/fhir/resources/practitioner) and [RelatedPerson](/docs/api/fhir/resources/relatedperson)) residing on the same or possibly distinct FHIR systems/applications, or indirectly through the use of business identifiers.

The [Person](/docs/api/fhir/resources/person) resource may be used in many situations/contexts, including:

- A set of demographics that can be used to co-ordinate the maintenance of this de-normalized information across practitioners, patients and/or related persons  
  _e.g. link known resources of the different types together within a system_
- A state/network based Master [Person](/docs/api/fhir/resources/person) Index  
  _e.g. A National [Identifier](/docs/api/fhir/datatypes/identifier) Index or a Network membership/subscriber list_
- A central register that links patient resources from multiple servers, indicating they all correspond to the same individual  
  _e.g. Within a large organization with many systems to be able to link the various records, without having to modify the source information with external links_
- A support for access monitoring software that is able to assert what practitioner, patient and related person records correspond to the same human being to assist in detecting improper querying.  
  _e.g. asserting that a [Patient](/docs/api/fhir/resources/patient) A is the same individual as a [RelatedPerson](/docs/api/fhir/resources/relatedperson) B who is related to [Patient](/docs/api/fhir/resources/patient) C, who is also [Practitioner](/docs/api/fhir/resources/practitioner) D. As such, monitoring for [Practitioner](/docs/api/fhir/resources/practitioner) D’s accesses to [Patient](/docs/api/fhir/resources/patient) A’s records should be carefully scrutinized._
- Local record(s) on a mobile device listing links to remote server patient resources  
  _e.g. A mobile phone application storing references to the hospitals they have access to_

> **Note:** The [Person](/docs/api/fhir/resources/person) resource is an advanced feature. Many systems don’t have a way to relate information across resource types, or systems, especially from [Patient](/docs/api/fhir/resources/patient) to [Practitioner](/docs/api/fhir/resources/practitioner), and therefore might not implement this functionality. Some do have ways of relating the [Patient](/docs/api/fhir/resources/patient) and [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource types. FHIR is also able to do this without the [Person](/docs/api/fhir/resources/person) resource, utilizing the [Patient](/docs/api/fhir/resources/patient).link property [(as shown in the Mother and newborn relationship example)](/docs/api/fhir/resources/patient)

## Relationships

[Person](/docs/api/fhir/resources/person) resources may have references to [Patient](/docs/api/fhir/resources/patient), [RelatedPerson](/docs/api/fhir/resources/relatedperson) and/or [Practitioner](/docs/api/fhir/resources/practitioner) resources. These linkages assert that all the records relate to the same individual.

[Person](/docs/api/fhir/resources/person) instances are never directly referenced as actors (authors, subjects, performers, etc.) Individual actors are always identified as either [Patient](/docs/api/fhir/resources/patient), [Practitioner](/docs/api/fhir/resources/practitioner) or [RelatedPerson](/docs/api/fhir/resources/relatedperson), depending on the role of the individual when undertaking the action. Therefore this resource SHALL NOT be referenced by any other clinical or administrative resources. E.g. it can be the focus of an operation or message or included in a [Bundle](/docs/api/fhir/resources/bundle), but cannot be a member of a [List](/docs/api/fhir/resources/list) or [Group](/docs/api/fhir/resources/group), the subject of an [Observation](/docs/api/fhir/resources/observation), or other similar non-infrastructural usage.

In some use cases the linkages will be indirect, and through business [Identifiers](/docs/api/fhir/datatypes/identifier), such as in the case of the various types of Master [Person](/docs/api/fhir/resources/person) Indexes, where the records are not there for the purpose of healthcare, but simply describing a population of people, and has other purposes and not just to represent a population patients.
