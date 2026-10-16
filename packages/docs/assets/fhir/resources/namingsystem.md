## Usage

Defines a specific code system or identifier system, so that it can be noted in a registry for other systems to find and understand an identifier.

## Relationships

The `CodeSystem` resource defines the content of a code system, and also its preferred identifier. The `NamingSystem` resource identifies the existence of a code or identifier system, and its possible and preferred identifiers. The key difference between the resources is who creates and manages them - `CodeSystem` resources are managed by the owner of the code system resource, who can properly define the features and content of the code system. `NamingSystem` resources, on the other hand, are frequently defined by 3rd parties that encounter the code system in use, and need to describe the use, but do not have the authority to define the features and content. Additionally, there may be multiple authoritative `NamingSystem` resources for a code system, but there should only be one `CodeSystem` resource.

## Background and Context

For discussion of policy for creating well maintained OIDs and URIs for resources, see [The HL7 Confluence site](https://confluence.hl7.org/display/FHIR/Migrating+OIDs+to+FHIR) .
