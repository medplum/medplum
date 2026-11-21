## Usage

> **Trial-Use Note:** In terms of scope and usage, the Orders and [Observations](/docs/api/fhir/resources/observation) workgroups wish to draw the attention of reviewers and implementers to the following issue:
>
> 1.  We are seeking input from the implementation community on whether to combine [DeviceRequest](/docs/api/fhir/resources/devicerequest) and [VisionPrescription](/docs/api/fhir/resources/visionprescription) for R4. The [parameters](https://www.hl7.org/fhir/devicerequest-definitions.html#parameters) element was added to [DeviceRequest](/docs/api/fhir/resources/devicerequest) for representing custom details for ordering devices. With this change, [VisionPrescription](/docs/api/fhir/resources/visionprescription) significantly overlaps [DeviceRequest](/docs/api/fhir/resources/devicerequest). To illustrate this, the [devicerequest-left-lens](https://www.hl7.org/fhir/devicerequest-left-lens.html) and [devicerequest-right-lens](https://www.hl7.org/fhir/devicerequest-right-lens.html) examples are based on the [general glasses example](https://www.hl7.org/fhir/visionprescription-example.html) in [VisionPrescription](/docs/api/fhir/resources/visionprescription).

**This resource is a _request_ resource from a FHIR workflow perspective - see [Workflow](https://www.hl7.org/fhir/workflow.html).**

This resource describes the request for the use of a device by a patient. The device may be any pertinent device specified in the [Device](/docs/api/fhir/resources/device) resource. Examples of devices that may be requested include wheelchair, hearing aids, or an insulin pump. The request may lead to the dispensing of the device to the patient or for use by the patient.

The device use request may represent an order or a prescription entered by a practitioner in a CPOE system or a proposal made by a clinical decision support (CDS) system based on a patient's clinical record and context of care.

## Relationships

This resource deals with the allocation of a device to a patient and while it may contain instructions on how to use the device, the data about getting the device to the patient is addressed in other resources. For example, certain devices must be implanted via a surgical or other procedure and the implantation or explantation is represented in the [Procedure](/docs/api/fhir/resources/procedure) or [ServiceRequest](/docs/api/fhir/resources/servicerequest) resource.

The [SupplyRequest](/docs/api/fhir/resources/supplyrequest) resource is similar in that it deals with requesting a particular item for a specific patient. However, [DeviceRequest](/docs/api/fhir/resources/devicerequest) is concerned with items where there is a patient focus, or instructions regarding their use, whereas [SupplyRequest](/docs/api/fhir/resources/supplyrequest) is concerned with inventory management.
