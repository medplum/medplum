## Usage

**These resources have not yet undergone proper review by PC, CQI, CDS, and OO. At this time, they are to be considered only as draft resource proposals for potential submission.**

**This resource is an _event_ resource from a FHIR workflow perspective - see [Workflow](https://www.hl7.org/fhir/workflow.html). It is the intent of the Orders and [Observation](/docs/api/fhir/resources/observation) Workgroup to align this resource with the workflow pattern for [_event_ resources](https://www.hl7.org/fhir/workflow.html#event).**

This resource records the use of a healthcare-related device by a patient. The record is the result of a report of use by the patient, another provider or a related person. The resource can be used to note the use of an assistive device such as a wheelchair or hearing aid, a contraceptive such an intra-uterine device, or other implanted devices such as a pacemaker.

## Relationships

This resource is different from [DeviceRequest](/docs/api/fhir/resources/devicerequest) which records a request to use the device. This also is distinct from the [Procedure](/docs/api/fhir/resources/procedure) resource which may describe the implantation or explantation of a device.
