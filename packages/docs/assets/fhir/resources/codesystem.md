## Usage

The FHIR terminology specification is based on two key concepts, originally defined in [HL7 v3 Core Principles](http://www.hl7.org/documentcenter/public/standards/V3/core_principles/infrastructure/coreprinciples/v3modelcoreprinciples.html) :

- **code system** - declares the existence of and describes a code system or code system supplement and its key properties, and optionally defines a part or all of its content. Also known as Ontology, Terminology, or Enumeration
- **value set** - specifies a set of codes drawn from one or more code systems, intended for use in a particular context. Value sets link between `CodeSystem` definitions and their use in [coded elements](https://www.hl7.org/fhir/terminologies.html)

Code systems define which codes (symbols and/or expressions) exist, and how they are understood. Value sets select a set of codes from one or more code systems to specify which codes can be used in a particular context.

The [CodeSystem](/docs/api/fhir/resources/codesystem) resource is used to declare the existence of a code system, and its key properties:

- Identifying URL and version
- Description, Copyright, publication date, and other metadata
- Some key properties of the code system itself - e.g. whether it exhibits concept permanence, whether it defines a compositional grammar, and whether the codes that it defines are case sensitive
- What filters can be used in value sets that use the code system in a [ValueSet](/docs/api/fhir/resources/valueset).compose element
- What concept properties are defined by the code system

In addition, the [CodeSystem](/docs/api/fhir/resources/codesystem) resource may list some or all of the concepts in the code system, along with their basic properties (code, display, definition), designations, and additional properties. Code System resources may also be used to define supplements, which extend an existing code system with additional designations and properties.

The [CodeSystem](/docs/api/fhir/resources/codesystem) resource is not intended to support the process of maintaining code systems. Instead, the focus is on publishing the properties and optionally the content of a code system for use throughout the FHIR eco-system, such as to support value set expansion and validation. Note that the important existing (large) code systems (SNOMED CT, LOINC, RxNorm, ICD family, etc.) all have their own maintenance systems and distribution formats, and [CodeSystem](/docs/api/fhir/resources/codesystem) is generally not an efficient way to distribute their content, though it is used as one way of declaring the filters and properties associated with those code systems.

## Relationships

- Code systems are used in [ValueSet](/docs/api/fhir/resources/valueset) resources
- The [Coding](https://www.hl7.org/fhir//api/fhir/datatypes/coding) data type refers to [CodeSystem](/docs/api/fhir/resources/codesystem) resources by their canonical URL
- The [CodeSystem](/docs/api/fhir/resources/codesystem) resource design is based, in part, on the code system functionality described in the [HL7 CTS 2](http://www.omg.org/spec/CTS2/1.0/) specification. A CTS2 server can be used to maintain code systems which are then published using the [CodeSystem](/docs/api/fhir/resources/codesystem) resource
- The [CodeSystem](/docs/api/fhir/resources/codesystem) resource documents the inherent structure and capabilities of code system, whereas the [TerminologyCapabilities](/docs/api/fhir/resources/terminologycapabilities) resource documents what a server hosting the code system is capable of

The `CodeSystem` resource declares the existence of a code system and its key properties including its preferred identifier. The `NamingSystem` resource identifies the existence of a code or identifier system, and its possible and preferred identifiers. The key difference between the resources is who creates and manages them - `CodeSystem` resources are managed by the owner or publisher of the code system, who can properly define the code system features and content. `NamingSystem` resources, on the other hand, are frequently defined by 3rd parties that encounter the code system in use, and need to describe the use, but do not have the authority to define the features and content. Additionally, there may be multiple authoritative `NamingSystem` resources for a code system, but ideally there would be only one authoritative `CodeSystem` resource (identified by its canonical URL) that is provided by the code system publisher, with multiple copies distributed on additional FHIR servers or elsewhere and used where needed.

Both Code System supplements and [Concept Maps](/docs/api/fhir/resources/conceptmap) may be used to define relationships between concepts in different systems. [ConceptMaps](/docs/api/fhir/resources/conceptmap) are assertions of the relationships between different concepts that are associated with particular contexts of use, while [CodeSystem](/docs/api/fhir/resources/codesystem) supplements are used to define inherent properties and semantics of the concepts in the code system

## Background and Context

When using code systems and value sets, proper differentiation between a code system and a value set is important. This is one very common area where significant clinical safety risks occur in practice. Implementers should be familiar with the content in [Using Codes in Resources](https://www.hl7.org/fhir/terminologies.html).

#### [CodeSystem](/docs/api/fhir/resources/codesystem) Identification[](/docs/api/fhir/resources/codesystem 'link to here')

A code system has three identifiers. The first two can be used to reference the code system in the FHIR context:

- `CodeSystem.id`: The [logical id](https://www.hl7.org/fhir/resource.html#id) on the system that holds the [CodeSystem](/docs/api/fhir/resources/codesystem) resource instance - this typically is expected to change as the resource moves from server to server. The location URI is constructed by appending the logical id to the server base address where the instance is found and the resource type. This URI should be a resolvable URL by which the resource instance may be retrieved, usually from a FHIR server, and it may be a relative reference typically to the server base URL.
- `CodeSystem.url`: The canonical URL that never changes for this code system - it is the same in every copy. The element is named `url` rather than `uri` for legacy reasons and to strongly encourage providing a resolvable URL as the identifier whenever possible. This canonical URL is used to refer to all instances of this particular code system across all servers and systems. Ideally, this URI should be a URL which resolves to the location of the master version of the code system, though this is not always possible.

> For example, the code systems published as part of the FHIR specification all have a location ("literal") URI which is the URL where they may be accessed in the FHIR specification itself. However, while a new version of the FHIR specification is being prepared, code systems that are published in the drafts will not be found in the current FHIR specification version.

Because it is common practice to copy (cache) code systems locally, most references to code systems can use either the canonical URL or the location ("literal") URL.

The third code system identifier is used typically for external references to the code system outside of FHIR:

- `CodeSystem.identifier`: A system/value pair that is used to identify the code system in other contexts (such as an OID in an [HL7 v3](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=186) specification)

For further information regarding resource identification, see [Resource Identity](https://www.hl7.org/fhir/resource.html#id).

This means that each code system has 2 different URIs that can be used to reference it - its canonical URL (the `url` element), and its local location from which it may be retrieved (which includes the `id` element). Because it is common practice to copy (cache) code systems locally, most references to code systems use the canonical URL.

Alternatively, the `identifier` and `version` elements may be used to reference this code system in a design, a profile, a [CDA](http://www.hl7.org/implement/standards/product_brief.cfm?product_id=7) template or [HL7 v3](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=186) message (in the CD data type codeSystem and codeSystemVersion properties). These different contexts may make additional restrictions on the possible values of these elements. The `identifier` is generally not needed when using code systems in a FHIR context, where the canonical URL is always the focus.
