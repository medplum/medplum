## Usage

A concept map defines a mapping from a set of concepts defined in a code system (commonly referred to as the "system") to one or more concepts defined in other code systems. In the mapping context, a system can be a typical [code system](https://www.hl7.org/fhir/terminologies.html) based on a recognized standard or local terminology (in any of its forms), or in some cases it may be an ["implicit" code system](/docs/api/fhir/resources/conceptmap) that is not based on a recognized terminology but still represents a set of "concepts" that can be usefully mapped. Mappings are one way - from the source to the target system. In many cases, the reverse mappings are valid, but this cannot be assumed to be the case.

Mappings between code system concepts are only intended to be defined in the context of a particular business usage. The business use case is normally defined by the specification of the source and target value sets. The mappings may be useful in other contexts, but this must be determined based on the context of use and meaning; it cannot be taken for granted automatically. An example where the usage context is important for choosing the correct mapping is mapping from a clinical terminology (e.g. SNOMED CT) to a classification (e.g. ICD-10) for either data analysis or billing. Mappings in the data analysis context would be targeted for an appropriate classification (often at a higher level), whereas in the billing context there may be specific requirements to be met (e.g. leaf level codes only) that could result in multiple mappings for a single source concept and then require additional information beyond the source concept itself in order to select the correct final mapping.

Note that all code systems (explicit or implicit) represented in FHIR have URI identifiers for value sets (also either explicit or implicit) that include the entire code system, and these ["all codes" value sets](https://www.hl7.org/fhir/terminology-service.html#4.6.5) can be used for mappings that are valid in all use contexts that are appropriate for the code system.

Each mapping for a concept from the source to target system includes an [equivalence](https://www.hl7.org/fhir/valueset-concept-map-equivalence.html) property that specifies how similar the mapping is (or, in some cases, that there is no valid mapping). There is one `element` for each concept or field in the source value set or system that needs to be mapped. Each source concept may have multiple targets:

- because there are multiple possible mappings (e.g., ambiguous)
- to specify a correct map, and specify other mappings as invalid
- when there are multiple mappings depending on the values of other elements (dependsOn)

There SHOULD be at least one target for each element, but some incomplete concept maps might not have a target for each concept.

A key concept for the [ConceptMap](/docs/api/fhir/resources/conceptmap) resource is the [$translate operation](https://www.hl7.org/fhir/conceptmap-operation-translate.html). This operation is a formal definition of an API by which a [terminology server](https://www.hl7.org/fhir/terminology-service.html) can allow clients to ask for a translation to be done based on the content in the [ConceptMap](/docs/api/fhir/resources/conceptmap) resource. As such it also provides useful perspective on the operational use of [ConceptMap](/docs/api/fhir/resources/conceptmap) resources in any context.

## Relationships

While `ConceptMap` resources are not referred to directly from any other resource, they may be included and used in [ImplementationGuide](/docs/api/fhir/resources/implementationguide) resources, and provide background knowledge that is useful in many contexts, including [operations](https://www.hl7.org/fhir/operations.html) defined in this specification.

In addition to `ConceptMap`, there is also the [StructureMap](/docs/api/fhir/resources/structuremap) resource. The [ConceptMap](/docs/api/fhir/resources/conceptmap) resource defines relationships between concepts in their own right, along with grading of their equivalencies, while the [StructureMap](/docs/api/fhir/resources/structuremap) defines an executable transform for instances that conform to a known structure.

Both [Code System](/docs/api/fhir/resources/codesystem) supplements and Concept Maps may be used to define relationships between concepts in different systems. [ConceptMaps](/docs/api/fhir/resources/conceptmap) are assertions of the relationships between different concepts that are associated with particular contexts of use, while [CodeSystem](/docs/api/fhir/resources/codesystem) supplements are used to define inherent properties and semantics of the concepts in the code system

## Background and Context

Further discussion of the issues involved in mapping between concept definition systems can be found in the [HL7 v3 Core Principles](http://www.hl7.org/documentcenter/public/standards/V3/core_principles/infrastructure/coreprinciples/v3modelcoreprinciples.html) document and the functionality described in the [OMG CTS 2](http://www.omg.org/spec/CTS2/1.0/) specification.
