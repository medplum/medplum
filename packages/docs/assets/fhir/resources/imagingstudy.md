## Usage

[ImagingStudy](/docs/api/fhir/resources/imagingstudy) provides information on a DICOM imaging study, and the series and imaging objects in that study. It also provides information on how to retrieve that information (in a native DICOM format, or in a rendered format, such as JPEG). [ImagingStudy](/docs/api/fhir/resources/imagingstudy) is used to make available information about all parts of a single DICOM study.

This resource provides mappings of its elements to DICOM attributes. DICOM attributes are identified by a 32-bit tag, presented in canonical form as two four-digit hexadecimal values within parentheses and separated by a comma, e.g. (0008,103E). The name and value representation (data type) of each attribute can be found in [DICOM Part 6 Data Dictionary](http://medical.nema.org/medical/dicom/current/output/html/part06.html) . The use of the attributes in the context of information objects, including detailed description of use, can be found in [DICOM Part 3 Information Object Definitions](http://medical.nema.org/medical/dicom/current/output/html/part03.html) . Attributes used in the DICOM query information models, such as "Number of Instances in Study", can be found in [DICOM Part 4 Annex C](http://medical.nema.org/medical/dicom/current/output/html/part04.html#chapter_C) .

[ImagingStudy](/docs/api/fhir/resources/imagingstudy) provides access to significant DICOM information but will only eliminate the need for DICOM query (e.g., QIDO-RS) in the simplest cases. The DICOM instances are not stored in the [ImagingStudy](/docs/api/fhir/resources/imagingstudy) resource; use of a DICOM WADO-RS server or other storage mechanism is needed.

An [ImagingStudy](/docs/api/fhir/resources/imagingstudy) SHALL reference one DICOM Study, and MAY reference a subset of that Study. More than one [ImagingStudy](/docs/api/fhir/resources/imagingstudy) MAY reference the same DICOM Study or different subsets of the same DICOM Study.

## Relationships

[ImagingStudy](/docs/api/fhir/resources/imagingstudy) is used for DICOM imaging and associated information. Use [Media](/docs/api/fhir/resources/media) to track non-DICOM images, video, or audio. [Binary](/docs/api/fhir/resources/binary) can be used to store arbitrary content. [DocumentReference](/docs/api/fhir/resources/documentreference) allow indexing and retrieval of clinical “documents” with relevant metadata.
