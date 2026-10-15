## Usage

A `SearchParameter` resource specifies a search parameter that may be used on the RESTful API to search or filter on a resource. The [SearchParameter](/docs/api/fhir/resources/searchparameter) resource declares:

- how to refer to the search parameter from a client
- how the search parameter is to be understood by the server
- where in the source resource the parameter matches

## Relationships

- Search [Parameters](/docs/api/fhir/resources/parameters) are referred to by [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement) resources via the canonical URL for a search parameter ([CapabilityStatement.rest.resource.searchParam.definition](https://www.hl7.org/fhir/capabilitystatement-definitions.html#CapabilityStatement.rest.resource.searchParam.definition))
- Search [Parameters](/docs/api/fhir/resources/parameters) can appear in an [Implementation Guide](/docs/api/fhir/resources/implementationguide) to specify how resources can be found

## Background and Context

Implementers should be familiar with the background and concepts described in [Search](https://www.hl7.org/fhir/search.html) on the RESTful API before working with this resource.

There is a [registry of all Search](https://www.hl7.org/fhir/searchparameter-registry.html) [Parameters](/docs/api/fhir/resources/parameters).
