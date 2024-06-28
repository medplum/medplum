---
sidebar_position: 3
---

import ExampleCode from '!!raw-loader!@site/..//examples/src/billing/insurance-eligibility-checks.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Insurance Eligibility Checks

Insurance eligibility checks determine whether a patient's insurance is active, in-network, and has applicable benefits. They ensure that the provider will ultimately get compensated by the patient's insurer for a specific product or service.

## Use Cases

Insurance eligibility checks cover a variety of use cases, but generally they are used to answer three questions:

1. Is this insurance active?
2. Does this insurance cover basic visits to a provider?
3. Does this insurance cover a specific service type?

The most basic use case for an eligibility check is simply seeing if the policy is active and in force.

Adding a second layer is checking if the policy is active and also covers basic visits to a provider. These include appointments like physicals and check-ups and is the most common type of eligibility request.

Because it is so common, these types of requests are defined by the [X12 Service Type Codes](https://x12.org/codes/service-type-codes) in **service code 30**. This service type is "Plan Coverage and General Benefits", and checks for active basic coverage.

Two common use cases for this service type are:

- Checking that a new patient's coverage is active and has general benefits.
- Checking coverage directly prior to a visit to ensure that the policy has not changed and the patient is still covered.

Finally, checking that insurance covers a specific service type adds a third layer to an eligibility check. These are done to ensure that a patient is covered for more complex care. It is recommended to use the [X12 Service Type Codes](https://x12.org/codes/service-type-codes) to illustrate the type of care that is being checked.

For example, if a patient needs to purchase durable medical equipment, you would use **service code 12**. This code represents "Durable Medical Equipment Purchased".

It is important to note that you should be checking the _service type_ to be provided, not the _specific service_, which is exactly what the [X12 Service Type Codes](https://x12.org/codes/service-type-codes) are designed to do.

## Preparing an Eligibility Check

FHIR follows a request/response pattern for eligibility checks. This uses two resources: the [`CoverageEligibilityRequest`](/docs/api/fhir/resources/coverageeligibilityrequest) to model the request to the insurer and the [`CoverageEligibilityResponse`](/docs/api/fhir/resources/coverageeligibilityresponse) to model their response.

To complete an eligibility check, you will need the following information:

- Patient demographic info, modeled as a reference to a [`Patient`](/docs/api/fhir/resources/patient) resource.
- Patient insurance coverage, modeled as a reference to a [`Coverage`](/docs/api/fhir/resources/coverage) resource (see our [insurance guide](/docs/billing/patient-insurance) for more info).
- Provider info, modeled as a reference to the relevant [`Practitioner`](/docs/api/fhir/resources/practitioner), [`PractitionerRole`](/docs/api/fhir/resources/practitionerrole), or [`Organization`](/docs/api/fhir/resources/organization) (see the [provider network guide](/docs/administration/provider-directory/provider-networks) for more info).
- The procedure/service to be provided and the diagnosis. This information should be on the relevant [`Encounter`](/docs/api/fhir/resources/encounter) (see our [blog post on Well Defined Service Menus](https://www.medplum.com/blog#well-defined-service-menu) for more info).

## Creating a Request

FHIR provides the [`CoverageEligibilityRequest`](/docs/api/fhir/resources/coverageeligibilityrequest) resource to model a request for an insurance eligibility check.

| **Element**          | **Description**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Code System** | **Example**                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| `patient`            | A reference to the [`Patient`](/docs/api/fhir/resources/patient) the request is for.                                                                                                                                                                                                                                                                                                                                                                                                                             |                 | Patient/homer-simpson                             |
| `provider`           | A reference to the [`Practitioner`](/docs/api/fhir/resources/practitioner) or [`Organization`](/docs/api/fhir/resources/organization) that will be providing the service. This is the party that is submitting the request, but is not necessarily the specific [`Practitioner`](/docs/api/fhir/resources/practitioner) who will be providing the service detailed within.                                                                                                                                       |                 | Practitioner/dr-alice-smith                       |
| `insurer`            | A reference to the insurance [`Organization`](/docs/api/fhir/resources/organization) that is providing coverage and will be evaluating the request.                                                                                                                                                                                                                                                                                                                                                              |                 | Organization/blue-cross                           |
| `purpose`            | The reason the request is being made. Must be one of the following: <ul><li>`auth-requirements`: A check of prior authorization that is required for the specified product or service.</li><li>`benefits`: The benefits on the plan or the benefits consumed by the specified product or service.</li><li>`discovery`: A request for the insurer to report any coverages they are aware of in addition to the ones specified.</li><li>`validation`: A check that the specified coverages are in-force.</li></ul> |                 | validation                                        |
| `insurance.coverage` | A reference to the [`Coverage`](/docs/api/fhir/resources/coverage) resource that is being checked.                                                                                                                                                                                                                                                                                                                                                                                                               |                 | Coverage/example-coverage                         |
| `item`               | Details about the items, services, or procedures for which eligibility is being checked.                                                                                                                                                                                                                                                                                                                                                                                                                         |                 | [See below](#the-item-being-checked-for-coverage) |
| `status`             | The status of the request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |                 | active                                            |
| `supportingInfo`     | Additional information about the request. This could include a patient's condition, more details about the situation, special considerations, or more.                                                                                                                                                                                                                                                                                                                                                           |                 |                                                   |

### The Item Being Checked for Coverage

As mentioned in the table above, the `item` element provides details about the eligibility being checked. This includes what procedure, product, or service is being provided as well as _why_ it is being provided.

The `item` field also provides additional data about the procedure, product, or service.

| **Property**       | **Description**                                                                                                                                                   | **Code System**                                         | **Example**                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| `category`         | The general type of the service or product being checked for eligibility.                                                                                         | [X12 Codes](https://x12.org/codes/service-type-codes)   | Vision Coverage               |
| `productOrService` | The product, drug, service, etc. that is being provided.                                                                                                          | [CPT Codes](https://www.ama-assn.org/topics/cpt-codes)  | 92340 - Fitting of eyeglasses |
| `diagnosis`        | The diagnosis for which care is being sought.                                                                                                                     | [ICD-10 Codes](https://www.icd10data.com/ICD10CM/Codes) | Condition/reduced-vision      |
| `provider`         | A reference to the [`Practitioner`](/docs/api/fhir/resources/practitioner) who is responsible for providing the service.                                          |                                                         | Practitioner/dr-alice-smith   |
| `quantity`         | The number of repetitions of the service that will be performed.                                                                                                  |                                                         | 2                             |
| `unitPrice`        | The price charged to the patient for a single unit of the service. This is the price that the provider charges for the service.                                   |                                                         | $200                          |
| `facility`         | A reference to the [`Location`](/docs/api/fhir/resources/location) or [`Organization`](/docs/api/fhir/resources/organization) where the service will be provided. |                                                         | Organization/example-hospital |
| `detail`           | A reference to the [`CarePlan`](/docs/api/fhir/resources/careplan) with details describing the service.                                                           |                                                         | CarePlan/improve-vision       |

<details>
  <summary>Example: A coverage eligibility request for a consultation</summary>
  <MedplumCodeBlock language="ts" selectBlocks="eligibilityRequest">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details>
  <summary>Example: A plan coverage and general benefits check</summary>
  <MedplumCodeBlock language="ts" selectBlocks="generalBenefitsCheckRequest">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Sending an Eligibility Check Request

Once you have created your [`CoverageEligibilityRequest`](/docs/api/fhir/resources/coverageeligibilityrequest), you need to send it to the insurer.

In addition to sending it directly to the insurer, there are services that simplify the process. Companies such as [Opkit](https://www.opkit.co/), [Availity](https://www.availity.com/), [Change Healthcare](https://www.changehealthcare.com/), [Waystar](https://www.waystar.com/) and [Candid Health](https://www.joincandidhealth.com/) allow you to send them eligibility checks directly.

Unfortunately, these companies format their requests based on [X12 EDI Format](https://x12.org/examples/005010x279) rather than FHIR, so you will need to convert your [`CoverageEligibilityRequest`](/docs/api/fhir/resources/coverageeligibilityrequest) to the correct format. This is a good workflow to implement [Bots](/docs/bots/bot-basics) to convert your request, interface with the company's API, and send the request. Additionally, you can have a [Subscription](/docs/subscriptions) to listen for a response and have a bot handle that as well.

## Receiving a Response

When you send your request, the insurer will review it and respond. This response will be modeled as a [`CoverageEligibilityResponse`](/docs/api/fhir/resources/coverageeligibilityresponse).

| **Element**               | **Description**                                                                                                                         | **Example**                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `outcome`                 | The outcome of the _processing_ of the request. Does NOT answer if the patient is eligible for coverage.                                | complete                                             |
| `disposition`             | A human-readable description of the status of the request.                                                                              | The policy is currently in-force.                    |
| `error`                   | Documents any errors that encountered during the eligibility check. Describes why a check may not have been able to be completed.       | Missing Identifier                                   |
| `insurance.item`          | Details about the benefits, authorization requirements, and current benefits of the insurance.                                          | [See below](#the-item-being-checked-for-coverage)    |
| `insurance.inforce`       | A boolean indicating if the coverage is in force for the requested period.                                                              | true                                                 |
| `insurance.benefitPeriod` | The term period of the benefits documented in the response.                                                                             | 2023-01-01 – 2023-12-31                              |
| `insurance.coverage`      | A reference to the patient's [`Coverage`](/docs/api/fhir/resources/coverage) resource.                                                  | Coverage/example-coverage                            |
| `request`                 | A reference to the original [`CoverageEligibilityRequest`](/docs/api/fhir/resources/coverageeligibilityrequest) this is in response to. | CoverageEligibilityRequest/check-for-vision-coverage |
| `purpose`                 | The reason the initial request was made. [See the `purpose` field in the above table](#creating-a-request) for the allowed valueset.    | validation                                           |
| `status`                  | The status of the response.                                                                                                             | active                                               |
| `insurer`                 | A reference to the [`Organization`](/docs/api/fhir/resources/organization) that is providing coverage and that sent the response.       | Organization/blue-cross                              |
| `patient`                 | A reference to the [`Patient`](/docs/api/fhir/resources/patient) the response is for.                                                   | Patient/homer-simpson                                |

### The Covered Items

Like its request counterpart, the [`CoverageEligibilityResponse`](/docs/api/fhir/resources/coverageeligibilityresponse) also has an `item` element, however it is a property on the `insurance` element rather than directly on the resource (e.g. `CoverageEligibilityResponse.insurance.item` vs `CoverageEligibilityRequest.item`). The `item` property contains details about allowed products and services under the insurance policy.

This field has some overlap with the request resource, but there are also significant differences between the two.

| **Property**              | **Description**                                                                                                          | **Code System**                                                                                                                      | **Example**                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `benefit`                 | A description of the benefits allowed and used to date under the coverage.                                               |                                                                                                                                      | allowedMoney: $10000, usedMoney: $645.99 |
| `description`             | A more detailed description of the benefits or services that are covered.                                                |                                                                                                                                      | Vision is covered in this policy.        |
| `authorizationRequired`   | A boolean indicating if authorization is required before providing service.                                              |                                                                                                                                      | true                                     |
| `authorizationSupporting` | Details about additional information or material needed to get authorization.                                            | [`CoverageEligibilityResponse` Auth Support Codes](https://build.fhir.org/valueset-coverageeligibilityresponse-ex-auth-support.html) | Lab Report                               |
| `excluded`                | A boolean indicating if the service is excluded from the plan.                                                           |                                                                                                                                      | false                                    |
| `network`                 | Indicates whether the benefits apply to in-network or out-of-network providers.                                          | [Network Type Codes](https://build.fhir.org/valueset-benefit-network.html)                                                           | in                                       |
| `unit`                    | Indicates whether the benefits apply to an individual or to a family.                                                    | [Unit Type Codes](https://build.fhir.org/valueset-benefit-unit.html)                                                                 | individual                               |
| `term`                    | The term or duration during which service is covered.                                                                    | [Benefit Term Codes](https://build.fhir.org/valueset-benefit-term.html)                                                              | annual                                   |
| `productOrService`        | The product, drug, service, etc. that is being provided.                                                                 | [CPT Codes](https://www.ama-assn.org/topics/cpt-codes)                                                                               | 92340 - Fitting of eyeglasses            |
| `provider`                | A reference to the [`Practitioner`](/docs/api/fhir/resources/practitioner) who is responsible for providing the service. |                                                                                                                                      | Practitioner/dr-alice-smith              |
| `category`                | The general type of the service or product being checked for eligibility.                                                |                                                                                                                                      | Vision Coverage                          |

:::note Coordination of Benefits
FHIR makes the `insurance` field on both the request and response an array, allowing for coordination of benefits across multiple insurance policies.

When sending a request, if there are multiple insurances, the `CoverageEligibilityRequest.insurance.focal` field should be set to `true` on the specific coverage being checked.

The `item` field is also an array on the `insurance` element of a [`CoverageEligibilityResponse`](/docs/api/fhir/resources/coverageeligibilityresponse) because it can represent multiple items that are covered under a specific insurance. When coordinating care among multiple policies, it can be common for multiple items from multiple coverages to be relevant to the check.

:::

<details>
  <summary>Example: A coverage eligibility response for a basic consultation</summary>
  <MedplumCodeBlock language="ts" selectBlocks="eligibilityResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details>
  <summary>Example: A plan coverage and general benefits check response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="generalBenefitsCheckResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## See Also

- [Eligibility Check Sample](https://github.com/medplum/medplum/tree/main/examples/medplum-eligibility-demo) code from Medplum
- [Eligibility/Benefits Check](https://youtu.be/K3q8DkdWs6I) explainer video on Youtube
- [Candid Health Eligibility Check Guide](https://docs.joincandidhealth.com/api-reference/eligibility)
- [Change Healthcare Bare Minimum Check](https://developers.changehealthcare.com/eligibilityandclaims/docs/use-bare-minimum-eligibility-requests)
