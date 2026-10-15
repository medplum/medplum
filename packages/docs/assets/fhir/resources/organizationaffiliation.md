## Usage

A relationship between 2 organizations over a period of time, where the entities are separate business entities. The relationship can optionally include details of locations/services from the participating organization.

The [OrganizationAffiliation](/docs/api/fhir/resources/organizationaffiliation) enables defining non-hierarchical relationships between organizations. For example:

- One organization may provide services to another organization  
  _e.g. An agency service providing casual staff, a radiology service, a diagnostic lab, catering services, community care services etc._
- Two or more organizations may form a partnership or joint venture
- An organization may be a member of an association, but not owned by it  
  _e.g. a hospital is a member the American Hospital Association, a hospital is a member of a health information exchange network_

## Relationships

The [Organization](/docs/api/fhir/resources/organization).partOf is used to form a hierarchical relationships within an organization which eventually resolves to a single organization. Each child in the tree is a subdivision of the parent.  
The [OrganizationAffiliation](/docs/api/fhir/resources/organizationaffiliation) is used to describe the relationship between two distinct organizations. It does not require a hierarchical relationship. A resource instance is for a singular linkage between 2 organizations (it does not contain all members), to create multiple affiliations, create additional resources for the other relationship between other organizations.  
Each instance contains its own period, and optionally links to specific related services/locations that are available. These referenced locations/services should be associated with the participating organization, and are available to the primary organization.

This resource should not be used when the affiliates are part of a single organization.
