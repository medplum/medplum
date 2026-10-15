## Usage

The [Library](/docs/api/fhir/resources/library) resource is a general purpose container for clinical knowledge assets. These assets may be defined using a non-FHIR representation, such as a shareable library of clinical logic, written in Clinical Quality Language (CQL), or the XML Schema for an information model, or they may be defined using FHIR resources such as the description of a protocol represented by a [PlanDefinition](/docs/api/fhir/resources/plandefinition) resource. In addition to representing the metadata of the library, the resource has elements for tracking dependencies, as well as for representing the parameters and data requirements for any expression functionality provided by the library.

For non-FHIR assets, the actual content of the library is represented using the [Attachment](/docs/api/fhir/datatypes/attachment) data type, and may either be referenced with a URL, or the content may be embedded as a base-64 encoded string. Either way, the `contentType` element of the attachment is used to indicate the representation of the library content.

Note that because the library content may be embedded as well as be retrievable from an external repository via the attachment URL, the possibility exists for the embedded content to be different from the content on the repository. With proper versioning and governance, this should never occur, but to minimize the potential impact of this possibility, implementers SHALL give precedence to the embedded content of a library when it is present.

## Relationships

The [Library](/docs/api/fhir/resources/library) resource is definitional in nature, meaning it is intended to represent shareable knowledge independent of any particular patient. This is in contrast to the [DocumentReference](/docs/api/fhir/resources/documentreference) resource, which captures non-FHIR content related to a specific patient, and the [Media](/docs/api/fhir/resources/media) and [Binary](/docs/api/fhir/resources/binary) resources which capture multimedia content and raw binary content, respectively.
