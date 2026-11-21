## Usage

The [TerminologyCapabilities](/docs/api/fhir/resources/terminologycapabilities) resource provides for a terminology server to describe how the underlying terminology service works.

A client can get the [TerminologyCapabilities](/docs/api/fhir/resources/terminologycapabilities) statement for a [Terminology Service](https://www.hl7.org/fhir/terminology-service.html) by using the [capabilities API](https://www.hl7.org/fhir/http.html#capabilities):

GET \[base\]/metadata?mode=terminology

This will return the [TerminologyCapabilities](/docs/api/fhir/resources/terminologycapabilities) resource that applies to the service itself.

## Relationships

- The [TerminologyCapabilities](/docs/api/fhir/resources/terminologycapabilities) resource does not describe the API - see [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement) for this.
- The [CodeSystem](/docs/api/fhir/resources/codesystem) resource documents the inherent structure and capabilities of code system, whereas the [TerminologyCapabilities](/docs/api/fhir/resources/terminologycapabilities) resource documents what a server hosting the code system is capable of
