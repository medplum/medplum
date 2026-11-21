## Usage

The [GuidanceResponse](/docs/api/fhir/resources/guidanceresponse) resource is used to represent the result of invoking a decision support service. It provides a container for the status of the response, any warnings or messages returned by the service, as well as any output data from the service and any suggested actions to be performed.

Use cases for the [GuidanceResponse](/docs/api/fhir/resources/guidanceresponse) resource include:

- Keeping a record of past service requests, including the ability to reference the context of the request such as the disease state
- Representing additional data requirements for subsequent service requests
- Representing Public Health case reporting and recording
- Sharing the results of decision support guidance and determination of reportability with clinicians and public health agencies

In addition, the [GuidanceResponse](/docs/api/fhir/resources/guidanceresponse) resource is aligned with the CDS Hooks response structure and so provides a mechanism to record the results of CDS Hooks interactions. For a detailed discussion of how the [GuidanceResponse](/docs/api/fhir/resources/guidanceresponse) resource can be used for this purpose, refer to the [Evaluation](https://www.hl7.org/fhir/clinicalreasoning-cds-on-fhir.html#evaluation) topic in the Clinical Reasoning module.
