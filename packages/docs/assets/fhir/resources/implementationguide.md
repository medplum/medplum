## Usage

An implementation guide (IG) is a set of rules about how FHIR resources are used (or should be used) to solve a particular problem, with associated documentation to support and clarify the usage. Classically, FHIR implementation guides are published on the web after they are generated using the [FHIR Implementation Guide Publisher](https://confluence.hl7.org/display/FHIR/IG+Publisher+Documentation) .

The `ImplementationGuide` resource is a single resource that defines the logical content of the IG, along with the important entry pages into the publication, so that the logical package that the IG represents, so that the contents are computable.

In particular, validators are able to use the [ImplementationGuide](/docs/api/fhir/resources/implementationguide) resource to validate content against the implementation guide as a whole. The significant conformance expectation introduced by the [ImplementationGuide](/docs/api/fhir/resources/implementationguide) resource is the idea of [Default Profiles](https://www.hl7.org/fhir/#default). Implementations may conform to multiple implementation guides at once, but this requires that the implementation guides are compatible (see [below](https://www.hl7.org/fhir/#compatibility)).

## Relationships

Implementation Guides contain two different types of resource references:

- Contents: A set of logical statements which implementations must conform to. These are almost always [conformance resources](https://www.hl7.org/fhir/conformance-module.html)
- Examples: Examples that illustrate the intent of the profiles defined in the implementation guide. These can be any kind of resource

An application's [Capability Statement](/docs/api/fhir/resources/capabilitystatement) may identify one or more implementation guides that an application conforms to.
