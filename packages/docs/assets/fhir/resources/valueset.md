## Usage

The FHIR terminology specification is based on two key concepts, originally defined in [HL7 v3 Core Principles](http://www.hl7.org/documentcenter/public/standards/V3/core_principles/infrastructure/coreprinciples/v3modelcoreprinciples.html) :

- `[CodeSystem](/docs/api/fhir/resources/codesystem)` - declares the existence of and describes a code system or code system supplement and its key properties, and optionally defines a part or all of its content. Also known as Ontology, Terminology, or Enumeration
- `ValueSet` - specifies a set of codes drawn from one or more code systems, intended for use in a particular context. Value sets link between [CodeSystem](/docs/api/fhir/resources/codesystem) definitions and their use in [coded elements](https://www.hl7.org/fhir/terminologies.html)

Value sets have 2 aspects:

- `[.compose](https://www.hl7.org/fhir/valueset-definitions.html#ValueSet.compose)`: A definition of which codes are intended to be in the value set ("intension")
- `[.expansion](https://www.hl7.org/fhir/valueset-definitions.html#ValueSet.expansion)`: The list of codes that are actually in the value set under a given set of conditions ("extension") - see [Value Set Expansion](/docs/api/fhir/resources/valueset)

The `ValueSet` resource can carry either the `.compose` or the `.expansion`, both of them, or neither of them (if only the metadata is being represented). There is an ["$expand" operation](https://www.hl7.org/fhir/valueset-operation-expand.html) which can be used to ask a server to generate an expansion given the composition rules, in a particular context, and a ["$validate-code" operation](https://www.hl7.org/fhir/valueset-operation-validate-code.html) which can be used to ask a server to check whether a given code or concept is in the value set in a particular context.

## Relationships

Value Sets are used by many resources:

- Value sets use [CodeSystem](/docs/api/fhir/resources/codesystem) resources by referring to them via their canonical reference.
- Value sets are used in [StructureDefinition](/docs/api/fhir/resources/structuredefinition), [OperationDefinition](/docs/api/fhir/resources/operationdefinition), [Questionnaire](/docs/api/fhir/resources/questionnaire), and other resources to specify the allowable contents for coded elements, or business rules for data processing
- [ConceptMap resources](/docs/api/fhir/resources/conceptmap) describe mappings between value sets
- [DataRequirement](https://www.hl7.org/fhir/meta/api/fhir/datatypes/datarequirement) data types to specify data processing conditions

For a full list of uses, see below.

The Characteristics of the `ValueSet` resource are derived from Formal Value Set Definitions:

- The [ValueSet](/docs/api/fhir/resources/valueset) resource design is based on the functionality described in the [OMG CTS 2](http://www.omg.org/spec/CTS2/1.0/) specification, along with metadata in the HL7 Value Set Definition specification. Value set resources can be converted to CTS2 value set or code system instances.
- The value set resource is aligned with the [Value Set Definition](https://confluence.hl7.org/display/VOC/Characteristics+of+a+Value+Set+Definition+%28VSD%29+Project) (VSD) project. Not all of the elements defined by the VSD are part of the base resource - some are defined as part of the [ValueSet](https://www.hl7.org/fhir/valueset-extensions.html) [Extensions](/docs/api/fhir/datatypes/extension). In the [ValueSet](/docs/api/fhir/resources/valueset) resource, the `compose` element is the VSD "Content Logical definition".

## Background and Context

When using value sets, proper differentiation between a code system and a value set is important. This is one very common area where significant clinical safety risks occur in practice. Implementers should be familiar with the content in [Using Codes in Resources](https://www.hl7.org/fhir/terminologies.html).

#### [ValueSet](/docs/api/fhir/resources/valueset) Identification[](/docs/api/fhir/resources/valueset 'link to here')

A value set has 3 identifiers:

- `ValueSet.id`: the [logical id](https://www.hl7.org/fhir/resource.html#id) on the system that holds the value set - this changes as it moves from server to server (this id, with the server address prepended, is called the 'literal identity' of the resource)
- `ValueSet.url`: the canonical URL that never changes for this value set - it is the same in every copy. The element is named `url` rather than `uri` for legacy reasons and to strongly encourage providing a resolvable URL as the identifier whenever possible. Ideally, it should be a literal URL that is the location of the master version of the value set, though this is not always possible
- `ValueSet.identifier`: A system/value pair that is used to identify the value set in other contexts (such as an OID in an [HL7 v3](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=186) specification)

In addition, any expansion for the value set also has `ValueSet.expansion.identifier` which uniquely identifies each expansion. For further information regarding resource identification, see [Resource Identity](https://www.hl7.org/fhir/resource.html#id).

This means that each value set has 2 different URLs that can be used to reference it - its canonical URL (the `url` element), and its local location from which it may be retrieved (which includes the `id` element). Because it is common practice to copy (cache) value sets locally, most references to value sets use the canonical URL.

> For example, the value sets published as part of FHIR all have a location ("literal") URI which is the URL where they may be accessed in the FHIR specification itself. Note, though, that while a new version of the FHIR Specification is being prepared, value sets that are published in the drafts will not be found in the current published FHIR specification at their canonical URL.

Alternatively, the `identifier` and `version` elements may be used to reference this value set in a design, a profile, a [CDA](http://www.hl7.org/implement/standards/product_brief.cfm?product_id=7) template or [HL7 v3](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=186) message (in the CD data type valueSet and valueSetVersion properties). These different contexts may make additional restrictions on the possible values of these elements. The `identifier` is generally not needed when using value sets in a FHIR context, where the canonical URL is always the focus.

#### Intensional vs Extensional[](https://www.hl7.org/fhir/valueset.html#int-ext 'link to here')

A value set may be described as intensional or extensional. The terms intensional and extensional come from the fields of mathematical logic and set theory.

An intensional value set is typically algorithmically defined. That is, the code group is defined as a rule e.g. all codes with the word diabetes in their description). The key benefit of intensional code groups is that they can be dynamically updated. Dynamic updating helps healthcare organizations keep current when new drugs (and their associated codes) become available or codes for diseases and other clinical concepts change. An intensional value set designed to contain all of the drugs in the beta blocker category can automatically receive a new beta blocker’s code as soon as it hits the market.

Extensional value sets, meanwhile, are enumerated lists of codes where each code is listed individually. This gives the author and user of the value set more control over the which codes are in the value set, but there is a greater maintenance burden to ensure that the value set is kept up to date.
