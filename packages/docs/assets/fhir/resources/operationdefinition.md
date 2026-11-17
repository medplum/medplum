## Usage

The [OperationDefinition](/docs/api/fhir/resources/operationdefinition) resource provides a formal computable definition of an [operation](https://www.hl7.org/fhir/operations.html) or [a named query](https://www.hl7.org/fhir/search.html#advanced). The [OperationDefinition](/docs/api/fhir/resources/operationdefinition) serves two principal purposes:

- To allow for automatic determination of system compatibility
- To allow for dynamic generation of forms to drive the operations

See below for further information about these, and about how operations and named queries are executed.

## Relationships

[OperationDefinitions](/docs/api/fhir/resources/operationdefinition) are published to define operations that servers can implement in a common fashion. The FHIR specification itself describes some (see below), and other organizations (including IHE, national programs, jurisdictions and vendors) are able to publish additional [OperationDefinitions](/docs/api/fhir/resources/operationdefinition).

[OperationDefinition](/docs/api/fhir/resources/operationdefinition) resources are referred to from two different places:

- From a [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement), to declare what operations a system does or should implement
- From another [OperationDefinition](/docs/api/fhir/resources/operationdefinition) resource. This allows for a server to describe a limited implementation of a standard operation, or to allow traceability if the server has to rename the operation due to a name clash
