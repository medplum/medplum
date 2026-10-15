Refer to the [US Core DiagnosticReport profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-diagnosticreport-note.html) for Report and Note exchange.

## Usage

**This resource is an _event_ resource from a FHIR workflow perspective - see [Workflow](https://www.hl7.org/fhir/workflow.html). It is the intent of the Orders and [Observation](/docs/api/fhir/resources/observation) Workgroup to align this resource with the workflow pattern for [_event_ resources](https://www.hl7.org/fhir/workflow.html#event).**

A diagnostic report is the set of information that is typically provided by a diagnostic service when investigations are complete. The information includes a mix of atomic results, text reports, images, and codes. The mix varies depending on the nature of the diagnostic procedure, and sometimes on the nature of the outcomes for a particular investigation. In FHIR, the report can be conveyed in a variety of ways including a [Document](https://www.hl7.org/fhir/documents.html), [RESTful API](https://www.hl7.org/fhir/http.html), or [Messaging](https://www.hl7.org/fhir/messaging.html) framework. Included within each of these, would be the [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource itself.

The [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource has information about the diagnostic report itself, and about the subject and, in the case of laboratory tests, the specimen of the report. It can also refer to the request details and atomic observations details or image instances. Report conclusions can be expressed as a simple text blob, structured coded data or as an attached fully formatted report such as a PDF.

The [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource is suitable for the following kinds of diagnostic reports:

- Laboratory (Clinical Chemistry, Hematology, Microbiology, etc.)
- Pathology / Histopathology / related disciplines
- Imaging Investigations (x-ray, CT, MRI etc.)
- Other diagnostics - Cardiology, Gastroenterology etc.

The [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource is not intended to support cumulative result presentation (tabular presentation of past and present results in the resource). The [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource does not yet provide full support for detailed structured reports of sequencing; this is planned for a future release.

## Relationships

Note that many diagnostic processes are procedures that generate observations and diagnostic reports. In many cases, such an observation does not require an explicit representation of the procedure used to create the observation, but where there are details of interest about how the diagnostic procedure was performed, the [Procedure](/docs/api/fhir/resources/procedure) resource is used to describe the activity.

In contrast to the [Observation](/docs/api/fhir/resources/observation) resource, the [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource typically includes additional clinical context and some mix of atomic results, images, imaging reports, textual and coded interpretation, and formatted representations. Laboratory reports, pathology reports, and imaging reports should be represented using the [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource. The [Observation](/docs/api/fhir/resources/observation) resource is referenced by the [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) to provide the atomic results for a particular investigation.

If you have a highly structured report, then use [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) - it has data and workflow support. Details about the request for a diagnostic investigation are captured in the various "request" resources (e.g., the [ServiceRequest](/docs/api/fhir/resources/servicerequest)) and allow the report to connect to clinical workflows. For more narrative driven reports with less work flow (histology/mortuary, etc.), the [Composition](/docs/api/fhir/resources/composition) resource would be more appropriate.

Image and media representations of the report and supporting images are referenced in the [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) resource. The details and actual image instances can be referenced directly in Diagnostic report using the "imaging" element or by indirect reference through the [ImagingStudy](/docs/api/fhir/resources/imagingstudy) resources which represent the content produced in a DICOM imaging study or set of DICOM Instances for a patient.

## Background and Context

**Diagnostic Report Names**

The words "tests", "results", "observations", "panels" and "batteries" are often used interchangeably when describing the various parts of a diagnostic report. This leads to much confusion. The naming confusion is worsened because of the wide variety of forms that the result of a diagnostic investigation can take, as described above. Languages other than English have their own variations on this theme.

This resource uses one particular set of terms. A practitioner "requests" a set of "tests". The diagnostic service returns a "report" which may contain a "narrative" - a written summary of the outcomes, and/or "results" - the individual pieces of atomic data which each are "observations". The results are assembled in "groups" which are nested structures of [Observations](/docs/api/fhir/resources/observation) (traditionally referred to as "panels" or " batteries" by laboratories) that can be used to represent relationships between the individual data items.
