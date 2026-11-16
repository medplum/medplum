## Usage

The [VisionPrescription](/docs/api/fhir/resources/visionprescription) resource is intended to support the information requirements for a prescription for glasses and contact lenses for a patient. Corrective optical lenses are considered a controlled substance and therefore a prescription is typically required for the provision of patient-specific lenses.

Vision prescriptions may only be issued by providers who have optical diagnosis within their scope of practice, typically ophthalmologists and optometrists. The prescription is a time-limited, typically two years, authorization for the provision of an unlimited number of lenses, glasses or contacts, which conform to the authorized specification by providers which have lens provision within their scope of practice, typically ophthalmologists , optometrists and opticians.

Health insurers typically require a copy of the prescription to ensure that a vision professional has examined the patient and that the power of the lenses exceeds some minimum, such as +- 0.75 diopters, to qualify for reimbursement under the insurance coverage.

The [VisionPrescription](/docs/api/fhir/resources/visionprescription) resource is an "request" resource from a FHIR workflow perspective - see [Workflow Request.](https://www.hl7.org/fhir/workflow.html#request)

#### Additional Information[](https://www.hl7.org/fhir/visionprescription.html#12.16.1.1 'link to here')

Additional information regarding resources conveying electronic claims content and usage may be found at:

- [Financial Resource Status Lifecycle](https://www.hl7.org/fhir/financial-module.html#resource-status): how .status is used in the financial resources.

## Relationships

The [VisionPrescription](/docs/api/fhir/resources/visionprescription) resource is used to provide the authorized specification of lenses for glasses and contacts which have well known and internationally consistent requirements, which is distinct from other types of health care authorizations detailed below.

**The health care domain includes a number of related resources**

<table border="1" cellpadding="1" cellspacing="2" frame="box"><tbody><tr><td>VisionPrescription</td><td>The <a href="/docs/api/fhir/resources/visionprescription">VisionPrescription</a> resource is used to provide the authorized specification of lenses for glasses and contacts.</td></tr><tr><td><a href="/docs/api/fhir/resources/devicerequest">DeviceRequest</a></td><td>This resource is used to prescribe, authorize, and request provision of a health care device such as a halter monitor or a wheelchair services.</td></tr><tr><td><a href="/docs/api/fhir/resources/medicationrequest">MedicationRequest</a></td><td>This resource is used to prescribe, authorize, and request provision of medications such a pharmaceuticals and vaccines.</td></tr><tr><td><a href="/docs/api/fhir/resources/servicerequest">ServiceRequest</a></td><td>This resource is used to prescribe, authorize, and request provision of health care services such as consultative or rehabilitative services.</td></tr></tbody></table>
