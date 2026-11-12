## Usage

**This resource is an _event_ resource from a FHIR workflow perspective - see [Workflow](https://www.hl7.org/fhir/workflow.html). It is the intent of the Orders and [Observation](/docs/api/fhir/resources/observation) Workgroup to align this resource with the workflow pattern for [_event_ resources](https://www.hl7.org/fhir/workflow.html#event).**

The scope of the supply resource is for supplies used in the healthcare process. This includes supplies specifically used in the treatment of patients as well as supply movement within an institution (transport a set of supplies from materials management to a service unit (nurse station). This resource does not include the provisioning of transportation services.

## Relationships

This resource overlaps with others such as [Device](/docs/api/fhir/resources/device) and [Medication](/docs/api/fhir/resources/medication). The **Supply** resource may be used to describe medications and devices when handling them generically (as any other supply). For example, when processing bulk orders, etc. However, when the medication, device or other aspects of the resource are important, (e.g. in a [MedicationRequest](/docs/api/fhir/resources/medicationrequest) or when identifying a device as a performer), the more detailed resource must be used.
