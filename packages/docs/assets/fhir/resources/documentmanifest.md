## Usage

A document manifest gathers a set of Resources into a single package with some clinical context that may be the subject of workflow such as targeted delivery. The usage of "document" in the case of [DocumentManifest](/docs/api/fhir/resources/documentmanifest), covers the broader scope of "document" as defined in REST and HTTP. This use is not limited to the formal "Document" model used for [FHIR documents](https://www.hl7.org/fhir/documents.html) or [DocumentReference](/docs/api/fhir/resources/documentreference) resources.

Typically, [DocumentManifest](/docs/api/fhir/resources/documentmanifest) resources are used in document indexing systems, such as [IHE XDS](http://wiki.ihe.net/index.php?title=Cross-Enterprise_Document_Sharing) . Such as profiled in [IHE Mobile access to Health Documents](<http://wiki.ihe.net/index.php/Mobile_access_to_Health_Documents_(MHD)>) . When used as a Manifest of "Documents" in this way, the [DocumentManifest](/docs/api/fhir/resources/documentmanifest) will point exclusively to [DocumentReference](/docs/api/fhir/resources/documentreference) resources.

A [DocumentManifest](/docs/api/fhir/resources/documentmanifest) resource could be used to bring clinical context grouping to a broader set of Resources.
