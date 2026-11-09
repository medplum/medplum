## Usage

This resource may be used in a shared registry of contact and other information for various organizations or it can be used merely as a support for other resources that need to reference organizations, perhaps as a [document](https://www.hl7.org/fhir/documents.html), [message](https://www.hl7.org/fhir/messaging.html) or as a [contained](https://www.hl7.org/fhir/references.html#contained) resource. If using a registry approach, it's entirely possible for multiple registries to exist, each dealing with different types or levels of organization.

## Relationships

The [Organization](/docs/api/fhir/resources/organization) resource is used for collections of people that have come together to achieve an objective. The [Group](/docs/api/fhir/resources/group) resource is used to identify a collection of people (or animals, devices, etc.) that are gathered for the purpose of analysis or acting upon, but are not expected to act themselves.

The [Organization](/docs/api/fhir/resources/organization) resource often exists as a hierarchy of organization resources, using the _part-of_ property to provide the association of the child to its parent organization.  
This organizational hierarchy helps communicate the conceptual structure, whereas the [Location](/docs/api/fhir/resources/location) resource provides the physical representation of the hierarchy.  
The linkage between [Organization](/docs/api/fhir/resources/organization) and [Location](/docs/api/fhir/resources/location) is from each point in the location hierarchy to the appropriate level in the [Organization](/docs/api/fhir/resources/organization) hierarchy. These links don't all have to be to the top level [Organization](/docs/api/fhir/resources/organization).  
When populating the organization and location hierarchies there is often not a clear distinction between these 2, however to assist in making the decision, [Locations](/docs/api/fhir/resources/location) are always used for recording where a service occurs, and hence where encounters and observations are associated. The [Organization](/docs/api/fhir/resources/organization) property on these resources might not be the location where the service took place.
