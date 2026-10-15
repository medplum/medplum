## Usage

There are situations where it is useful or required to handle pure binary content using the same framework as other resources. Typically, this is when the binary content is referred to from other FHIR Resources. Using the same framework means that the existing servers, security arrangements, code libraries, etc. can handle additional related content. Typically, [Binary](/docs/api/fhir/resources/binary) resources are used for handling content such as:

- [CDA](http://www.hl7.org/implement/standards/product_brief.cfm?product_id=7) Documents (i.e. with XDS)
- PDF Documents
- Images

A binary resource can contain any content, whether text, image, pdf, zip archive, etc. These resources are served in their native form on the rest interface, but can also be represented in XML, JSON, or other formats, such as when including these resources in a [Bundle](/docs/api/fhir/resources/bundle) (used when it is convenient to include these in the response directly rather than leaving them by reference).

## Relationships

When a FHIR server finds it convenient to manage the content within the same overall REST framework as the other resources, the [Binary](/docs/api/fhir/resources/binary) resource is generally used as the target in the [Attachment](https://www.hl7.org/fhir//api/fhir/datatypes/attachment) data type to reference content via the `.url` element, such as in the [DocumentReference](/docs/api/fhir/resources/documentreference) and [Media](/docs/api/fhir/resources/media) resources. Consequently, the [Binary](/docs/api/fhir/resources/binary) resource can be a target wherever the [Attachment](/docs/api/fhir/datatypes/attachment) data type is used such as in the [DocumentReference](/docs/api/fhir/resources/documentreference) resource.

The [DocumentReference](/docs/api/fhir/resources/documentreference) and [Media](/docs/api/fhir/resources/media) resources allow conveying binary content (via attachment) or pointing to one (as a `Binary` or non-FHIR URI) along with the metadata around that resource, and as such are searchable. [Binary](/docs/api/fhir/resources/binary) resources do not support 'search'.

While CDA and PDF documents are conveyed as [Binary](/docs/api/fhir/resources/binary) (because they cannot be expressed natively in FHIR), [FHIR Documents](https://www.hl7.org/fhir/documents.html) do not need to be similarly encoded and can be sent natively in FHIR using [Bundle](/docs/api/fhir/resources/bundle). However, in some situations FHIR Documents may be sent as a [Binary](/docs/api/fhir/resources/binary) if there is a need to treat them the same as other types of documents or binary files.

The [Binary](/docs/api/fhir/resources/binary) resource does not convey context of the file. If the context (information such as author, procedure, technique, etc.) should be conveyed, [Media](/docs/api/fhir/resources/media) or [DocumentReference](/docs/api/fhir/resources/documentreference) resources are appropriate. The [Binary](/docs/api/fhir/resources/binary) resource may be used to convey actual binary file content conveyed by those resources.

The [Media](/docs/api/fhir/resources/media) resource is preferred for handling images, but this is not possible when the content is already binary (e.g. in some uses of [IHE XDS](https://wiki.ihe.net/index.php/Cross-Enterprise_Document_Sharing) ).
