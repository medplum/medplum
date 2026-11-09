## Usage

> **Trial-Use Note:** In terms of scope and usage, the Orders and [Observations](/docs/api/fhir/resources/observation) workgroups wish to draw the attention of reviewers and implementers to the following issues and changes.
>
> 1.  We are seeking input from the implementation community on whether to combine [SupplyRequest](/docs/api/fhir/resources/supplyrequest) and [DeviceRequest](/docs/api/fhir/resources/devicerequest) for R4.
> 2.  The [parameters](https://www.hl7.org/fhir/supplyrequest-definitions.html#parameters) element was added to [SupplyRequest](/docs/api/fhir/resources/supplyrequest) for representing custom details for ordering devices.
>
> Feedback is welcome [here](http://hl7.org/fhir-issues)

**This resource is a _request_ resource from a FHIR workflow perspective - see [Workflow](https://www.hl7.org/fhir/workflow.html). It is the intent of the Orders and [Observation](/docs/api/fhir/resources/observation) Workgroup to align this resource with the workflow pattern for [_request_ resources](https://www.hl7.org/fhir/workflow.html).**

The scope of the [SupplyRequest](/docs/api/fhir/resources/supplyrequest) resource is for recording the request of supplies used in the healthcare process. This includes supplies specifically used in the treatment of patients as well as supply movement within an institution (transport a set of supplies from materials management to a service unit (nurse station). This resource does not include the provisioning of transportation services.

The [SupplyRequest](/docs/api/fhir/resources/supplyrequest) resource allows requesting only a single item. If a workflow requires requesting multiple items simultaneously, this is done using multiple instances of this resource. These instances can be linked in different ways, depending on the needs of the workflow. For guidance, refer to [the Request pattern](https://www.hl7.org/fhir/request.html#compound)

## Relationships

Note that the [SupplyRequest](/docs/api/fhir/resources/supplyrequest) records the fact that a request was made. To actually act on that request, additional workflow beyond simply the existence of a [SupplyRequest](/docs/api/fhir/resources/supplyrequest) is required. This can be achieved by using an [Task](/docs/api/fhir/resources/task) resource, with the [SupplyRequest](/docs/api/fhir/resources/supplyrequest) referenced from the [Task](/docs/api/fhir/resources/task).focus, or by using the [SupplyRequest](/docs/api/fhir/resources/supplyrequest) resource in the context of an messaging or service workflow where the request is explicit or implicit. The [SupplyDelivery](/docs/api/fhir/resources/supplydelivery) resource represents the fulfillment as a result of [SupplyRequest](/docs/api/fhir/resources/supplyrequest) being acted upon.

The [SupplyRequest](/docs/api/fhir/resources/supplyrequest) resource is used for _inventory management_. When requesting medication, substances and devices when there is a patient focus or instructions regarding their use, [DeviceRequest](/docs/api/fhir/resources/devicerequest) or [MedicationRequest](/docs/api/fhir/resources/medicationrequest) should be used instead
