## Usage

The [PaymentReconciliation](/docs/api/fhir/resources/paymentreconciliation) resource provides the bulk payment details associated with a payment by the payor for receivable amounts, such as for goods and services rendered by a provider to patients covered by insurance plans offered by that payor. These are the payment reconciliation details which may align to the individual payment amounts indicated on discrete [ClaimResponses](/docs/api/fhir/resources/claimresponse) or [Invoices](/docs/api/fhir/resources/invoice) for example.

Bulk payments need to provide a means to associate the amounts paid against specific [Claims](/docs/api/fhir/resources/claim), [Invoices](/docs/api/fhir/resources/invoice), and other financial exchanges and adjustments, to the bulk payment itself in order to reconcile accounts receivable.

The [PaymentReconciliation](/docs/api/fhir/resources/paymentreconciliation) resource is a "event" resource from a FHIR workflow perspective - see [Workflow Event.](https://www.hl7.org/fhir/workflow.html#event)

#### Additional Information[](https://www.hl7.org/fhir/paymentreconciliation.html#13.9.1.1 'link to here')

Additional information regarding electronic payment notice content and usage may be found at:

- [Financial Resource Status Lifecycle](https://www.hl7.org/fhir/financial-module.html#resource-status): how .status is used in the financial resources.

## Relationships

The [PaymentReconciliation](/docs/api/fhir/resources/paymentreconciliation) resource serves to correlate a payment amount to the adjudicated claim amounts appearing on one or more [ClaimResponses](/docs/api/fhir/resources/claimresponse). [PaymentReconciliation](/docs/api/fhir/resources/paymentreconciliation) provides the bulk payment details associated with a payment by the payor for goods and services rendered by a provider to patients covered by insurance plans offered by that payor.

The [PaymentNotice](/docs/api/fhir/resources/paymentnotice) resource is used to indicate that a payment has, or is about to occur. The resource is used commonly when tracking of payment occurences is required for regulatory or business purposes.

The [ClaimResponse](/docs/api/fhir/resources/claimresponse) resource is an insurer's adjudication and/or authorization of a set of healthcare-related goods and services for a patient against the patient's insurance coverages and does not indicate that payment has occured.

For reporting out to patients or transferring data to patient centered applications, such as patient health Record (PHR) application, the [ExplanationOfBenefit](/docs/api/fhir/resources/explanationofbenefit) should be used instead.

**The eClaim domain includes a number of related resources**

<table border="1" cellpadding="1" cellspacing="2" frame="box"><tbody><tr><td>PaymentReconciliation</td><td>Provides the bulk payment details associated with a payment by the payor for goods and services rendered by a provider to patients covered by insurance plans offered by that payor.</td></tr><tr><td><a href="/docs/api/fhir/resources/claimresponse">ClaimResponse</a></td><td>A payor's adjudication and/or authorization response to the suite of services provided in a <a href="/docs/api/fhir/resources/claim">Claim</a>. Typically the <a href="/docs/api/fhir/resources/claimresponse">ClaimResponse</a> references the <a href="/docs/api/fhir/resources/claim">Claim</a> but does not duplicate the clinical or financial information provided in the claim.</td></tr><tr><td><a href="/docs/api/fhir/resources/explanationofbenefit">ExplanationOfBenefit</a></td><td>This resource combines the information from the <a href="/docs/api/fhir/resources/claim">Claim</a> and the <a href="/docs/api/fhir/resources/claimresponse">ClaimResponse</a>, stripping out any provider or payor proprietary information, into a unified information model suitable for use for: patient reporting; transferring information to a <a href="/docs/api/fhir/resources/patient">Patient</a> Health Record system; and, supporting complete claim and adjudication information exchange with regulatory and analytics organizations and other parts of the provider's organization.</td></tr><tr><td><a href="/docs/api/fhir/resources/paymentnotice">PaymentNotice</a></td><td>An indication that a payment has occured, is about to occur, or has been cancelled.</td></tr></tbody></table>
