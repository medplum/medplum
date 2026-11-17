## Usage

#### Use Cases[](/docs/api/fhir/resources/group 'link to here')

The [Group](/docs/api/fhir/resources/group) resource is used in one of two ways:

1.  To define a group of specific people, animals, devices, etc. that is being tracked, examined or otherwise referenced as part of healthcare-related activities
2.  To define a set of _possible_ people, animals, devices, etc. that are of interest for some intended future healthcare-related activities

Examples of the former could include group therapy or treatment sessions, exposed entities tracked as part of public health, etc. The latter might be used to define expected subjects for a clinical study.

Both use cases are handled by a single resource because the data elements captured tend to be similar.

## Relationships

There are a number of mechanisms in FHIR for communicating collections of resources:

- The [List](/docs/api/fhir/resources/list) resource - enumerates a flat collection of resources and provides features for managing the collection. While a particular [List](/docs/api/fhir/resources/list) instance may represent a "snapshot", from a business process perspective the notion of "List" is dynamic – items are added and removed over time. The [List](/docs/api/fhir/resources/list) resource references other resources. [Lists](/docs/api/fhir/resources/list) may be curated and have specific business meaning.
- This [Group](/docs/api/fhir/resources/group) resource - defines a group of specific people, animals, devices etc. by enumerating them, or by describing qualities that group members have. The group resource refers to other resources, possibly implicitly. [Groups](/docs/api/fhir/resources/group) are intended to be acted upon or observed as a whole; e.g. performing therapy on a group, calculating risk for a group, etc. This resource will commonly be used for public health (e.g. describing an at-risk population), clinical trials (e.g. defining a test subject pool) and similar purposes.
- [CareTeam](/docs/api/fhir/resources/careteam). [Group](/docs/api/fhir/resources/group) is distinct from [CareTeam](/docs/api/fhir/resources/careteam). [Group](/docs/api/fhir/resources/group) is patient-independent and identifies an undifferentiated set of individuals who are intended to be the target of one or more clinical activities (e.g. set of clinical trial participants, set of individuals impacted by or at risk of a public health event, a herd or flock, etc.) The [CareTeam](/docs/api/fhir/resources/careteam) resource establishes a set of relationships and roles and is specific to a particular [Patient](/docs/api/fhir/resources/patient). The actors are the individual members or organized group of individuals. [CareTeam](/docs/api/fhir/resources/careteam) can be referenced by [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare), [Encounter](/docs/api/fhir/resources/encounter), or [CarePlan](/docs/api/fhir/resources/careplan) to identify the set of individuals (and their respective roles) who are intended to be involved in providing the care defined by those resources.
- The [Bundle](/docs/api/fhir/resources/bundle) resource - is an infrastructure container for a group of resources. It does not have narrative and is used to group collections of resources for transmission, persistence or processing (e.g. messages, documents, transactions, query responses, etc.) The content of bundles is typically algorithmically determined for a particular exchange or persistence purpose.
- The [Composition](/docs/api/fhir/resources/composition) resource - defines a set of healthcare-related information that is assembled together into a single logical document that provides a single coherent statement of meaning, establishes its own context and that has clinical attestation with regard to who is making the statement. The composition resource provides the basic structure of a FHIR [document](https://www.hl7.org/fhir/documents.html). The full content of the document is expressed using a bundle. [Compositions](/docs/api/fhir/resources/composition) will often reference [Lists](/docs/api/fhir/resources/list) as the focus of particular sections.
- The [DomainResource](https://www.hl7.org/fhir/domainresource.html).`contained` element - allows multiple resources to be nested inside any DomainResource. This is a special type of grouping where the grouped resources lose independent existence - they no longer have their own identifiers, can't easily be queried independently, etc. Use of this grouping is a technical mechanism for managing the independence of resources and has no impact on meaning.

Contained, bundled and remotely referenced resources convey the same meaning.
