---
title: CapabilityStatement
sidebar_position: 91
---

# CapabilityStatement

A Capability Statement documents a set of capabilities (behaviors) of a FHIR Server for a particular version of FHIR
  that may be used as a statement of actual server functionality or a statement of required or desired server
  implementation.

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
| url | 0..1 | uri | Canonical identifier for this capability statement, represented as a URI (globally unique)
| version | 0..1 | string | Business version of the capability statement
| name | 0..1 | string | Name for this capability statement (computer friendly)
| title | 0..1 | string | Name for this capability statement (human friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 1..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the capability statement
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for capability statement (if applicable)
| purpose | 0..1 | markdown | Why this capability statement is defined
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| kind | 1..1 | code | instance \| capability \| requirements
| instantiates | 0..* | canonical | Canonical URL of another capability statement this implements
| imports | 0..* | canonical | Canonical URL of another capability statement this adds to
| software | 0..1 | BackboneElement | Software that is covered by this capability statement
| implementation | 0..1 | BackboneElement | If this describes a specific instance
| fhirVersion | 1..1 | code | FHIR Version the system supports
| format | 1..* | code | formats supported (xml \| json \| ttl \| mime type)
| patchFormat | 0..* | code | Patch formats supported
| implementationGuide | 0..* | canonical | Implementation guides supported
| rest | 0..* | BackboneElement | If the endpoint is a RESTful one
| messaging | 0..* | BackboneElement | If messaging is supported
| document | 0..* | BackboneElement | Document definition

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the capability statement | CapabilityStatement.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the capability statement | CapabilityStatement.useContext.value
| context-type | token | A type of use context assigned to the capability statement | CapabilityStatement.useContext.code
| date | date | The capability statement publication date | CapabilityStatement.date
| description | string | The description of the capability statement | CapabilityStatement.description
| fhirversion | token | The version of FHIR | CapabilityStatement.version
| format | token | formats supported (xml \| json \| ttl \| mime type) | CapabilityStatement.format
| guide | reference | Implementation guides supported | CapabilityStatement.implementationGuide
| jurisdiction | token | Intended jurisdiction for the capability statement | CapabilityStatement.jurisdiction
| mode | token | Mode - restful (server/client) or messaging (sender/receiver) | CapabilityStatement.rest.mode
| name | string | Computationally friendly name of the capability statement | CapabilityStatement.name
| publisher | string | Name of the publisher of the capability statement | CapabilityStatement.publisher
| resource | token | Name of a resource mentioned in a capability statement | CapabilityStatement.rest.resource.type
| resource-profile | reference | A profile id invoked in a capability statement | CapabilityStatement.rest.resource.profile
| security-service | token | OAuth \| SMART-on-FHIR \| NTLM \| Basic \| Kerberos \| Certificates | CapabilityStatement.rest.security.service
| software | string | Part of the name of a software application | CapabilityStatement.software.name
| status | token | The current status of the capability statement | CapabilityStatement.status
| supported-profile | reference | Profiles for use cases supported | CapabilityStatement.rest.resource.supportedProfile
| title | string | The human-friendly name of the capability statement | CapabilityStatement.title
| url | uri | The uri that identifies the capability statement | CapabilityStatement.url
| version | token | The business version of the capability statement | CapabilityStatement.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the capability statement | CapabilityStatement.useContext
| context-type-value | composite | A use context type and value assigned to the capability statement | CapabilityStatement.useContext

