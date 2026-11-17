## Usage

The _StructureMap_ resource defines a detailed set of rules that describe how one [Structure](/docs/api/fhir/resources/structuredefinition) is related to another and provides sufficient detail to allow for automated conversion of instances.

The intention of the structure map resource is to allow a specialist in formats and interoperability to specify the full relationships between two structures (e.g. a CDA document and a set of FHIR resources), and then many different systems - both testing and production clinical systems - can leverage that to automatically transform from one format to the other.

Maps are unidirectional: they map from the source structure to the target structure, and no reverse map is implied. Even if the mapping is simple, and loss-less, it cannot be assumed that there are no conditions that might additionally apply in the reverse direction.

The mapping language, along with a concrete syntax, is defined in detail in [the FHIR Mapping Language](https://www.hl7.org/fhir/mapping-language.html). The [StructureMap](/docs/api/fhir/resources/structuremap) resource represents the abstract syntax, and the concrete syntax is the recommended narrative representation for a [StructureMap](/docs/api/fhir/resources/structuremap). See also the [Tutorial](https://www.hl7.org/fhir/mapping-tutorial.html).

## Relationships

Note that many mappings between models only establish conceptual equivalence between the structures. These models are useful because they quickly convey how the structures are related to humans, whereas more maps with sufficient detail to support instance transformation are necessarily full of fine detail that can obscure the conceptual relationships. The [ConceptMap](/docs/api/fhir/resources/conceptmap) resource is suitable for representing high level relationships between models, while this _StructureMap_ resource is intended to describe the full details that need to be known in order to transform an instance of data from one structure to another.

The _StructureMap_ resource assumes that both the source and the target models are fully defined using [StructureDefinition](/docs/api/fhir/resources/structuredefinition) resources - either resources, or logical models, and is described accordingly. However, there is no direct relationship between the mapping language contained in the [StructureMap](/docs/api/fhir/resources/structuremap) resource, and the existence of the appropriate structure definitions, so that this mapping language could be used to define a map from an HL7 v2 message to a CDA document. Note, that various implementation contexts may introduce a direct relationship (e.g. see \[op to defined\]).

It's possible to apply the mapping language to structures that do not even have (or cannot have) formally defined types, although the type-related parts of the mapping language cannot be used in these cases.

## Background and Context

Each structure map contains, in addition to the standard metadata that all conformance resources contain, the following information:

- A list of the structure definitions referenced by the map
- A list of other structure maps that the map uses
- One or more groups of rules that describe how content in the source is transformed to content in the target

Each group of rules defines a set of input and output variables that must be passed when the group is invoked in a particular context. When a group is invoked, all the rules in the group are checked to see whether they apply.

Each rule may have some or all of the following properties:

- A name - used as the identity in internal references, and traces
- Contexts in both source and target models that define where the rule applies
- A set of source elements that provide data to be mapped
- Conditions that specify if the rule is to apply
- A set of target elements that will be created
- Transform rules that describe how raw data is converted from the source format to the target format (e.g. string manipulation)
- Flags for how instances that can repeat are handled
- Additional rules that apply to the newly created elements (e.g. new contexts)

The mapping language is entirely declarative; there is no imperative or procedural aspects to the definitions.
