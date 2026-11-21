## Usage

The [Coverage](/docs/api/fhir/resources/coverage) resource is intended to provide the high-level identifiers and descriptors of an insurance plan, typically the information which would appear on an insurance card, which may be used to pay, in part or in whole, for the provision of health care products and services.

This resource may also be used to register 'SelfPay' where an individual or organization other than an insurer is taking responsibility for payment for a portion of the health care costs. Selfpay should not be confused with being a guarantor of the patient's account.

The [Coverage](/docs/api/fhir/resources/coverage) resource is a "event" resource from a FHIR workflow perspective - see [Workflow Request.](https://www.hl7.org/fhir/workflow.html#event)

## Relationships

**The eClaim domain includes a number of related insurance resources**

<table border="1" cellpadding="1" cellspacing="2" frame="box"><tbody><tr><td>Coverage</td><td>The <a href="/docs/api/fhir/resources/coverage">Coverage</a> resource is intended to provide the high-level identifiers and descriptors of a specific insurance plan for a specific individual - essentially the insurance card information. This may alternately provide the individual or organization, selfpay, which will pay for products and services rendered.</td></tr><tr><td><a href="/docs/api/fhir/resources/contract">Contract</a></td><td>A <a href="/docs/api/fhir/resources/contract">Contract</a> resource holds the references to parties who have entered into an agreement of some type, the parties who may sign or witness such an agreement, descriptors of the type of agreement and even the actual text or executable copy of the agreement. The agreement may be of a variety of types including service contracts, insurance contracts, directives, etc. The contract may be either definitional or actual instances.</td></tr><tr><td><a href="/docs/api/fhir/resources/insuranceplan">InsurancePlan</a></td><td>The <a href="/docs/api/fhir/resources/insuranceplan">InsurancePlan</a> resource holds the definition of an insurance plan which an insurer may offer to potential clients through insurance brokers or an online insurance marketplace. This is only the plan definition and does not contain or reference a list of individuals who have purchased the plan.</td></tr></tbody></table>
