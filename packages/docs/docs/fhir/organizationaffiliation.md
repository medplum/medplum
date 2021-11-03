---
title: OrganizationAffiliation
sidebar_position: 470
---

# OrganizationAffiliation

Defines an affiliation/assotiation/relationship between 2 distinct oganizations, that is not a part-of relationship/sub-division relationship.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..* | Identifier | Business identifiers that are specific to this role
| active | 0..1 | boolean | Whether this organization affiliation record is in active use
| period | 0..1 | Period | The period during which the participatingOrganization is affiliated with the primary organization
| organization | 0..1 | Reference | Organization where the role is available
| participatingOrganization | 0..1 | Reference | Organization that provides/performs the role (e.g. providing services or is a member of)
| network | 0..* | Reference | Health insurance provider network in which the participatingOrganization provides the
  role's services (if defined) at the indicated locations (if defined)
| code | 0..* | CodeableConcept | Definition of the role the participatingOrganization plays
| specialty | 0..* | CodeableConcept | Specific specialty of the participatingOrganization in the context of the role
| location | 0..* | Reference | The location(s) at which the role occurs
| healthcareService | 0..* | Reference | Healthcare services provided through the role
| telecom | 0..* | ContactPoint | Contact details at the participatingOrganization relevant to this Affiliation
| endpoint | 0..* | Reference | Technical endpoints providing access to services operated for this role

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| active | token | Whether this organization affiliation record is in active use | OrganizationAffiliation.active
| date | date | The period during which the participatingOrganization is affiliated with the primary organization | OrganizationAffiliation.period
| email | token | A value in an email contact | OrganizationAffiliation.telecom
| endpoint | reference | Technical endpoints providing access to services operated for this role | OrganizationAffiliation.endpoint
| identifier | token | An organization affiliation's Identifier | OrganizationAffiliation.identifier
| location | reference | The location(s) at which the role occurs | OrganizationAffiliation.location
| network | reference | Health insurance provider network in which the participatingOrganization provides the role's services (if defined) at the indicated locations (if defined) | OrganizationAffiliation.network
| participating-organization | reference | The organization that provides services to the primary organization | OrganizationAffiliation.participatingOrganization
| phone | token | A value in a phone contact | OrganizationAffiliation.telecom
| primary-organization | reference | The organization that receives the services from the participating organization | OrganizationAffiliation.organization
| role | token | Definition of the role the participatingOrganization plays | OrganizationAffiliation.code
| service | reference | Healthcare services provided through the role | OrganizationAffiliation.healthcareService
| specialty | token | Specific specialty of the participatingOrganization in the context of the role | OrganizationAffiliation.specialty
| telecom | token | The value in any kind of contact | OrganizationAffiliation.telecom

