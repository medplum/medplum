## Usage

**This resource is a request resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html).

[ServiceRequest](/docs/api/fhir/resources/servicerequest) is a record of a request for a procedure or diagnostic or other service to be planned, proposed, or performed, as distinguished by the `ServiceRequest.intent` field value, with or on a patient. The procedure will lead to either a [Procedure](/docs/api/fhir/resources/procedure) or [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport), which in turn may reference one or more [Observations](/docs/api/fhir/resources/observation), which summarize the performance of the procedures and associated documentation such as observations, images, findings that are relevant to the treatment/management of the subject. This resource may be used to share relevant information required to support a referral or a transfer of care request from one practitioner or organization to another when a patient is required to be referred to another provider for a consultation /second opinion and/or for short term or longer term management of one or more health issues or problems.

Examples include:

- diagnostic tests/studies
- endoscopic procedures
- counseling
- biopsies
- therapies (e.g., physio-, social-, psychological-)
- (exploratory) surgeries or procedures
- exercises
- specialist consultation and assessments
- community services
- nursing services
- pharmacist medication review, and
- other clinical interventions.

[Procedures](/docs/api/fhir/resources/procedure) may be performed by a healthcare professional, a friend or relative or in some cases by the patient themselves.

The principal intention of [ServiceRequest](/docs/api/fhir/resources/servicerequest) is to support ordering procedures for one patient (which includes non-human patients in veterinary medicine). However, in many contexts, healthcare related processes include performing diagnostic investigations on groups of subjects, devices involved in the provision of healthcare, and even environmental locations such as ducts, bodies of water, etc. [ServiceRequest](/docs/api/fhir/resources/servicerequest) supports all these usages. The service request may represent an order that is entered by a practitioner in a CPOE system as well as a proposal made by a clinical decision support (CDS) system based on a patient's clinical record and context of care. Planned procedures referenced by a [CarePlan](/docs/api/fhir/resources/careplan) may also be represented by this resource.

The general work flow that this resource facilitates is that a clinical system creates a service request. The service request is then accessed by or exchanged with a system, perhaps via intermediaries, that represents an organization (e.g., diagnostic or imaging service, surgical team, physical therapy department) that can perform the procedure. The organization receiving the service request will, after it accepts the request, update the request as the work is performed, and then finally issue a report that references the requests that it fulfilled.

The [ServiceRequest](/docs/api/fhir/resources/servicerequest) resource allows requesting only a single procedure. If a workflow requires requesting multiple procedures simultaneously, this is done using multiple instances of this resource. These instances can be linked in different ways, depending on the needs of the workflow. For guidance, refer to the [Request pattern](https://www.hl7.org/fhir/request.html)

## Relationships

[ServiceRequest](/docs/api/fhir/resources/servicerequest) is a record of a proposal/plan or order for a service to be performed that would result in a [Procedure](/docs/api/fhir/resources/procedure), [Observation](/docs/api/fhir/resources/observation), [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport), [ImagingStudy](/docs/api/fhir/resources/imagingstudy) or similar resource. In contrast to [ServiceRequest](/docs/api/fhir/resources/servicerequest), [Task](/docs/api/fhir/resources/task) which spans both intent and event and tracks the execution through to completion and is intended for "administrative" actions like requesting and tracking things to be done to a record, or keeping track of a checklist of steps such to be performed as part of a fulfilment process. A [ServiceRequest](/docs/api/fhir/resources/servicerequest) can be higher-level authorization that triggered the creation of [Task](/docs/api/fhir/resources/task), or it can be the "request" resource [Task](/docs/api/fhir/resources/task) is seeking to fulfill.

[ServiceRequest](/docs/api/fhir/resources/servicerequest) and [CommunicationRequest](/docs/api/fhir/resources/communicationrequest) are related. A [CommunicationRequest](/docs/api/fhir/resources/communicationrequest) is a request to merely disclose information. Whereas a [ServiceRequest](/docs/api/fhir/resources/servicerequest) would be used to request information as part of training or counseling - i.e. when the process will involve verification of the patient's comprehension or an attempt to change the patient's mental state. In some workflows both may exist. For example, upon receiving a [CommunicationRequest](/docs/api/fhir/resources/communicationrequest) a practitioner might initiate a [ServiceRequest](/docs/api/fhir/resources/servicerequest).
