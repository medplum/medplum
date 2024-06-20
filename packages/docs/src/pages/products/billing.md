# Billing and Payments

Send data to your billing provider of choice. Easily connect to physician groups or bill through multiple professional corporations. Capture financial data and drive automated data transfer to other systems, such as a clearinghouse, revenue-cycle-management tool, payment processor, eligibility checker or medical biller.

## Features

The Medplum billing and payments implementation is a standards compliant implementation of the [FHIR Financial Module](http://www.hl7.org/fhir/financial-module.html).

- **Data Management**: create and update FHIR resources related to billing and payments. See the list of FHIR resources below.
- **Representing Insurance Coverage**: the [Coverage](/docs/api/fhir/resources/coverage) FHIR resource represents patient insurance and is a major driver of workflow.
- **Connecting to Payors**: Payors often have a FHIR interface, and make it possible for patients to request their financial data. Here's an example from [CMS Blue Button](https://bluebutton.cms.gov/developers/#try-the-api).
- **Integrations**: Sending claims to various billing systems is a common workflow and clearinghouses and billing providers often have APIs. An integration [like this](https://developers.changehealthcare.com/eligibilityandclaims/reference/processclaim) can be implemented via [bots](/docs/bots).
- **Patient Pay**: Patient payments can be enabled through a payment processor like Stripe. [Invoice](https://app.medplum.com/Invoice) and [PaymentReconciliation](https://app.medplum.com/PaymentReconciliation) are the commonly used resources to manage data associated with use case. [Bots](/docs/bots) can be used to consume web hooks or callbacks from payment processors and create the appropriate resources.
- **Provider/Network Management**: Having excellent record-keeping on which organizations are in-network and change history is useful for implementing billing logic. `Organization.type` is the recommended field in which to store this data.

## FHIR Resources

| Resource                    | App Link                                                        | Create New                                                  | API Documentation                                           |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Account                     | [View All](https://app.medplum.com/Account)                     | [Create New](https://app.medplum.com/Account/new)           | [API](/docs/api/fhir/resources/account)                     |
| Contract                    | [View All](https://app.medplum.com/Contract)                    | [Create New](https://app.medplum.com/Contract/new)          | [API](/docs/api/fhir/resources/contract)                    |
| Coverage                    | [View All](https://app.medplum.com/Coverage)                    | [Create New](https://app.medplum.com/Coverage/new)          | [API](/docs/api/fhir/resources/coverage)                    |
| CoverageEligibilityRequest  | [View All](https://app.medplum.com/CoverageEligibilityRequest)  | Create via API or workflow                                  | [API](/docs/api/fhir/resources/coverageeligibilityrequest)  |
| CoverageEligibilityResponse | [View All](https://app.medplum.com/CoverageEligibilityResponse) | Create via API or workflow                                  | [API](/docs/api/fhir/resources/coverageeligibilityresponse) |
| EnrollmentRequest           | [View All](https://app.medplum.com/EnrollmentRequest)           | [Create New](https://app.medplum.com/EnrollmentRequest/new) | [API](/docs/api/fhir/resources/enrollmentrequest)           |
| EnrollmentResponse          | [View All](https://app.medplum.com/EnrollmentResponse)          | Create via API or workflow                                  | [API](/docs/api/fhir/resources/enrollmentresponse)          |
| Claim                       | [View All](https://app.medplum.com/Claim)                       | [Create New](https://app.medplum.com/Claim/new)             | [API](/docs/api/fhir/resources/claim)                       |
| ClaimResponse               | [View All](https://app.medplum.com/ClaimResponse)               | Create via API or workflow                                  | [API](/docs/api/fhir/resources/claimresponse)               |
| PaymentNotice               | [View All](https://app.medplum.com/PaymentNotice)               | Create via API or workflow                                  | [API](/docs/api/fhir/resources/paymentnotice)               |
| PaymentReconciliation       | [View All](https://app.medplum.com/PaymentReconciliation)       | Create via API or workflow                                  | [API](/docs/api/fhir/resources/paymentreconciliation)       |
| ExplanationOfBenefit        | [View All](https://app.medplum.com/ExplainationOfBenefit)       | Create via API or workflow                                  | [API](/docs/api/fhir/resources/explanationofbenefit)        |
| Organization                | [View All](https://app.medplum.com/Organization)                | [Create New](https://app.medplum.com/Organization/new)      | [API](/docs/api/fhir/resources/organization)                |
| MoneyQuantity               | FHIR Datatype                                                   | Create via API or workflow                                  | [Reference](/docs/api/fhir/datatypes/moneyquantity)         |

## Related Reading

- [Billing Documentation](/docs/billing) - including creating CMS 1500 and Superbills
- [Foo Medical Billing Page](https://foomedical.com/account/membership-and-billing) sample patient portal with financial data.
- [Provider Demo](https://provider.medplum.com) includes credential management.

## Integration Reference

- [X12 Service Codes](https://x12.org/codes/service-type-codes)
- [CMS Blue Button](https://bluebutton.cms.gov/developers/#try-the-api) API Guide shows how to access FHIR data from CMS (Payor).
- [Charge Healthcare Clearinghouse](https://developers.changehealthcare.com/) developer documentation.
