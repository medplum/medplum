## Usage

The [PaymentNotice](/docs/api/fhir/resources/paymentnotice) resource indicates the resource for which the payment has been indicated and reports the current status information of that payment. The payment notice may be used by providers and payers to advise the provider or regulatory bodies of the state of a payment (check in the mail/EFT sent, payment cashed, payment canceled). Employers or Insurance Exchanges may use this to advise payers of premium payment.

Payers and/or providers may have the need to advise providers and/or regulators of the status of claim settlement and payment completion. This same resource may be used by employers and insurance exchanges to advise payers that premium payments have been issued and settled.

The [PaymentNotice](/docs/api/fhir/resources/paymentnotice) resource is a "event" resource from a FHIR workflow perspective - see [Workflow Event.](https://www.hl7.org/fhir/workflow.html#event)

#### Additional Information[](https://www.hl7.org/fhir/paymentnotice.html#13.8.1.1 'link to here')

Additional information regarding electronic payment notice content and usage may be found at:

- [Financial Resource Status Lifecycle](https://www.hl7.org/fhir/financial-module.html#resource-status): how .status is used in the financial resources.
- [Batches](https://www.hl7.org/fhir/financial-module.html#batch): how eClaims may handle batches of eligibility, claims, payments and responses.

## Relationships

The [PaymentNotice](/docs/api/fhir/resources/paymentnotice) resource is used to indicate that a payment is, or is about to occur. The resource is used commonly when tracking of payment occurences is required for regulatory or business purposes, such as ensuring that payment of claim adjudications occurs within a specific timeframe. The [PaymentNotice](/docs/api/fhir/resources/paymentnotice) is not used to report adjudicated amounts (see [ClaimResponse](/docs/api/fhir/resources/claimresponse)) or to reconcile adjudicated amounts against actual payment (see [PaymentReconciliation](/docs/api/fhir/resources/paymentreconciliation))

The [ClaimResponse](/docs/api/fhir/resources/claimresponse) resource is an insurer's adjudication and/or authorization of a set of healthcare-related goods and services for a patient against the patient's insurance coverages and does not indicate that payment has occured.

The [PaymentReconciliation](/docs/api/fhir/resources/paymentreconciliation) resource serves to correlate payment amounts to the adjudicated claim amounts appearing on one or more [ClaimResponses](/docs/api/fhir/resources/claimresponse).

**The eClaim domain includes a number of related resources**

<table border="1" cellpadding="1" cellspacing="2" frame="box"><tbody><tr><td>PaymentNotice</td><td>An indication that a payment has occured, is about to occur, or has been cancelled.</td></tr><tr><td><a href="/docs/api/fhir/resources/claimresponse">ClaimResponse</a></td><td>A payor's adjudication and/or authorization response to the suite of services provided in a <a href="/docs/api/fhir/resources/claim">Claim</a>. Typically the <a href="/docs/api/fhir/resources/claimresponse">ClaimResponse</a> references the <a href="/docs/api/fhir/resources/claim">Claim</a> but does not duplicate the clinical or financial information provided in the claim.</td></tr><tr><td><a href="/docs/api/fhir/resources/paymentreconciliation">PaymentReconciliation</a></td><td>Provides the bulk payment details associated with a payment by the payor for goods and services rendered by a provider to patients covered by insurance plans offered by that payor.</td></tr></tbody></table>
