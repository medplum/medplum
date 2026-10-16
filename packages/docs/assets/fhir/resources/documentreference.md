Refer to the [US Core DocumentReference profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-documentreference.html).

## Usage

A [DocumentReference](/docs/api/fhir/resources/documentreference) resource is used to index a document, clinical note, and other binary objects to make them available to a healthcare system. A document is some sequence of bytes that is identifiable, establishes its own context (e.g., what subject, author, etc. can be displayed to the user), and has defined update management. The [DocumentReference](/docs/api/fhir/resources/documentreference) resource can be used with any document format that has a recognized mime type and that conforms to this definition.

Typically, [DocumentReference](/docs/api/fhir/resources/documentreference) resources are used in document indexing systems, such as [IHE XDS](http://wiki.ihe.net/index.php?title=Cross-Enterprise_Document_Sharing) , such as profiled in [IHE Mobile access to Health Documents](<http://wiki.ihe.net/index.php/Mobile_access_to_Health_Documents_(MHD)>) .

[DocumentReference](/docs/api/fhir/resources/documentreference) is metadata describing a document such as:

- [CDA](http://www.hl7.org/implement/standards/product_brief.cfm?product_id=7) documents in FHIR systems
- [FHIR documents](https://www.hl7.org/fhir/documents.html) stored elsewhere (i.e. registry/repository following the XDS model)
- [PDF documents](http://en.wikipedia.org/wiki/Portable_Document_Format) , Scanned Paper, and digital records of faxes
- Clinical Notes in various forms
- Image files (e.g., JPEG, GIF, TIFF)
- Non-Standard formats (e.g., WORD)
- Other kinds of documents, such as records of prescriptions or immunizations

## Relationships

FHIR defines both a [document format](https://www.hl7.org/fhir/documents.html) and this document reference. FHIR documents are for documents that are authored and assembled in FHIR. This resource is mainly intended for general references to assembled documents.

The document that is a target of the reference can be a reference to a FHIR document served by another server, or the target can be stored in the special [FHIR](https://www.hl7.org/fhir/http.html#binary) [Binary](/docs/api/fhir/resources/binary) Resource, or the target can be stored on some other server system. The document reference is also able to address documents that are retrieved by a service call such as an XDS.b RetrieveDocumentSet, or a DICOM exchange, or an [HL7 v2](http://www.hl7.org/implement/standards/product_brief.cfm?product_id=185) message query - though the way each of these service calls works must be specified in some external standard or other documentation.

A `DocumentReference` describes some other document. This means that there are two sets of provenance information relevant here: the provenance of the document, and the provenance of the document reference. Sometimes, the provenance information is closely related, as when the document producer also produces the document reference, but in other workflows, the document reference is generated later by other actors. In the `DocumentReference` resource, the [meta](https://www.hl7.org/fhir/resource.html#Meta) content refers to the provenance of the reference itself, while the content described below concerns the document it references. Like all resources, there is overlap between the information in the resource directly, and in the general [Provenance](/docs/api/fhir/resources/provenance) resource. This is discussed as [part of the description of the](/docs/api/fhir/resources/provenance) [Provenance](/docs/api/fhir/resources/provenance) resource.
