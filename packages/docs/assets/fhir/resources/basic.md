## Usage

**Basic** is a special type of resource. Unlike all other resources, it doesn't correspond to a specific pre-defined HL7 concept. Instead, it's a placeholder for any resource-like concept that isn't already defined in the HL7 specification.

The [Basic](/docs/api/fhir/resources/basic) resource is intended for use in three circumstances:

1.  When an implementer needs a resource concept that is likely to be defined by HL7 in the future but they have not yet done so (due to bandwidth issues, lack of sufficient requirements, lower prioritization, etc.)
2.  When there's a need to convey a narrative-only construct that doesn't neatly correspond to one of the other resources, either because it combines aspects of several resources (e.g. Assessment + Plan) or because the allowed content is flexible such that the system can't be totally sure what sort of content might have been included in the narrative text.
3.  Other than the circumstances above, this resource will see minimal use. To keep the FHIR specification manageable, it cannot incorporate every site-specific requirement that might be needed in some implementation somewhere. This set of resources likely won't ever be officially defined in HL7.

There's also a fourth circumstance: An implementer wishes to convey information that could/should be conveyed using a standard resource, however they want to represent the information in a custom format that isn't aligned with the official resource's elements. While this resource would be the preferred way of meeting that use-case because it will at least be wire-format compatible, such a use would not be conformant because making use of the [Basic](/docs/api/fhir/resources/basic) resource would prevent the healthcare-related information from being safely processed, queried and analyzed by other conformant systems.

Implementers don't need to be concerned with which of the three categories their desired resource fits within. If they need a resource and it clearly doesn't fit one of the ones currently defined, they should use [Basic](/docs/api/fhir/resources/basic).

## Background and Context

[Basic](/docs/api/fhir/resources/basic) defines only a minimal set of data elements - those necessary to identify what kind of resource it represents and those necessary to support resource [compartmenting](/docs/api/fhir/resources/compartmentdefinition). All other data elements are represented using the [extension](https://www.hl7.org/fhir/extensibility.html) mechanism. It's entirely possible to have a [Basic](/docs/api/fhir/resources/basic) resource instance with nothing other than narrative, a subject and code. And, in practice, that's all many systems will understand.
