## Usage

The [CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest) makes a request of an insurer asking them to provide, in the form of an [CoverageEligibilityResponse](/docs/api/fhir/resources/coverageeligibilityresponse), information regarding: (validation) whether the specified coverage(s) is valid and in-force; (discovery) what coverages the insurer has for the specified patient; (benefits) the benefits provided under the coverage; whether benefits exist under the specified coverage(s) for specified classes of services and products; and (auth-requirements) whether preauthorization is required, and if so what information may be required in that preauthorization, for the specified service classes or services.

The [CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest) resource is a "event" resource from a FHIR workflow perspective - see [Workflow Event.](https://www.hl7.org/fhir/workflow.html#event)

#### Additional Information[](https://www.hl7.org/fhir/coverageeligibilityrequest.html#13.2.1.1 'link to here')

Additional information regarding electronic coverage eligibility content and usage may be found at:

- [Financial Resource Status Lifecycle](https://www.hl7.org/fhir/financial-module.html#resource-status): how .status is used in the financial resources.
- [Subrogation](https://www.hl7.org/fhir/financial-module.html#subrogation): how eClaims may handle patient insurance coverages when another insurer rather than the provider will settle the claim and potentially recover costs against specified coverages.
- [Coordination of Benefit](https://www.hl7.org/fhir/financial-module.html#cob): how eClaims may handle multiple patient insurance coverages.
- [Batches](https://www.hl7.org/fhir/financial-module.html#batch): how eClaims may handle batches of eligibility, claims and responses.
- [Attachments and Supporting Information](https://www.hl7.org/fhir/financial-module.html#attachments): how eClaims may handle the provision of supporting information, whether provided by content or reference, within the eClaim resource when submitted to the payor or later in a resource which refers to the subject eClaim resource. This includes how payors how request additional supporting information from providers.

## Relationships

[CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest) should be used when requesting whether the patient's coverage is inforce, whether it is valid at this or a specified date, or requesting the benefit details or preauthorization requirements associated with a coverage.

The [Claim](/docs/api/fhir/resources/claim) resource should be used to request the adjudication and/or authorization of a set of healthcare-related goods and services for a patient against the patient's insurance coverages, or to request what the adjudication would be for a supplied set of goods or services should they be actually supplied to the patient.

The [Coverage](/docs/api/fhir/resources/coverage) resource contains the information typically found on the health insurance card for an individual used to identify the covered individual to the insurer and is referred to by the [CoverageEligibilityRequest](/docs/api/fhir/resources/coverageeligibilityrequest).

**The eClaim domain includes a number of related resources**

<table border="1" cellpadding="1" cellspacing="2" frame="box"><tbody><tr><td>CoverageEligibilityRequest</td><td>Patient and insurance coverage information provided to an insurer for them to respond, in the form of an <a href="/docs/api/fhir/resources/coverageeligibilityresponse">CoverageEligibilityResponse</a>, with information regarding whether the stated coverage is valid and in-force and optionally to provide the insurance details of the policy.</td></tr><tr><td><a href="/docs/api/fhir/resources/claim">Claim</a></td><td>A suite of goods and services and insurances coverages under which adjudication or authorization is requested.</td></tr><tr><td><a href="/docs/api/fhir/resources/coverage">Coverage</a></td><td>Provides the high-level identifiers and descriptors of an insurance plan, typically the information which would appear on an insurance card, which may be used to pay, in part or in whole, for the provision of health care products and services.</td></tr></tbody></table>
