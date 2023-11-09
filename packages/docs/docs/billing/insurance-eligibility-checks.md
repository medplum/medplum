import ExampleCode from '!!raw-loader!@site/..//examples/src/billing/insurance-eligibility-checks.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Insurance Eligibility Checks

Insurance eligibility checks determine whether a patient's insurance is active, in-network, what benefits they may have, and other relevant information. They ensure that the provider will ultimately get compensated by the patient's insurer and that the patient will be able to afford the product or service.

## Processing an Eligibility Check

To process an insurance eligibility request, a `CoverageEligibilityRequest` resource is created and sent to an insurer or service provider. A `CoverageEligibilityResponse` is then returned with the results.

To complete an eligibility check, you will need the following information:

- Patient info, modeled as a reference to a `Patient` resource
- Patient insurance coverage, modeled as a reference to a [`Coverage` resource](/docs/billing/patient-insurance)
- Provider info, modeled as a reference to the relevant `Practitioner`, `PractitionerRole`, or `Organization`. For additional details, see the [provider network docs](/docs/fhir-datastore/provider-directory/provider-networks).
- The procedure/service to be provided and the diagnosis. This information should be on the relevant `Encounter`. See our blog post on [Well Defined Service Menus for more details](https://www.medplum.com/blog/digital-health-operations#well-defined-service-menu).

## Creating a `CoverageEligibilityRequest`

FHIR provides the `CoverageEligbilityRequest` resource to model a request for an insurance eligibility check.

| **Element**          | **Description**                                                                                                                                        | **Code System** | **Example**                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------------- |
| `status`             | The status of the request.                                                                                                                             |                 | active                                                   |
| `purpose`            | The reason the request is being made. Must be one of the following: 'auth-requirements', 'benefits', 'discovery', 'validation'                         |                 | validation                                               |
| `patient`            | A reference to the patient the request is for.                                                                                                         |                 | Patient/homer-simpson                                    |
| `provider`           | A reference to the practitioner or organization that will be providing the service.                                                                    |                 | Practitioner/dr-alice-smith                              |
| `insurer`            | A reference to the insurance organization that is providing coverage and will be evaluating the request.                                               |                 | Organization/blue-cross                                  |
| `supportingInfo`     | Additional information about the request. This could include a patient's condition, more details about the situation, special considerations, or more. |                 |                                                          |
| `insurance`          | Details about the insurance coverage of the patient.                                                                                                   |                 |                                                          |
| `insurance.coverage` | A reference to the coverage resource that is being checked.                                                                                            |                 | Coverage/example-coverage                                |
| `insurance.focal`    | A boolean used when a client has multiple insurance policies to indicate if this is the specific one being checked.                                    |                 | true                                                     |
| `item`               | Details about the items, services, or procedures for which eligibility is being checked.                                                               |                 | [See below](#the-coverageeligibilityrequestitem-element) |

### The `CoverageEligibilityRequest.item` element

As mentioned in the table above, the `item` element provides details about the eligibility being checked. The `item` field is an object, where much of the most important information is stored.

| **Property**       | **Description**                                                                 | **Code System** | **Example**                   |
| ------------------ | ------------------------------------------------------------------------------- | --------------- | ----------------------------- |
| `category`         | The general type of the service or product being checked for eligibility.       |                 | Vision Coverage               |
| `productOrService` | The product, drug, service, etc. that is being provided.                        | CPT Codes       | 92340 - Fitting of eyeglasses |
| `provider`         | A reference to the practitioner who is responsible for providing the service.   |                 | Practitioner/dr-alice-smith   |
| `quantity`         | The number of repetitions of the service that will be performed.                |                 | 2                             |
| `unitPrice`        | The price charged to the patient for a single unit of the service.              |                 | $200                          |
| `facility`         | A reference to the location or organization where the service will be provided. |                 | Organization/example-hospital |
| `diagnosis`        | The diagnosis for which care is being sought.                                   |                 | Condition/reduced-vision      |
| `detail`           | A reference to the care plan or proposal with details describing the service.   |                 | CarePlan/improve-vision       |

<details><summary>Example: A coverage eligibility request for a basic consultation</summary>
  <MedplumCodeBlock language="ts" selectBlocks="eligibilityRequest">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Sending a `CoverageEligibilityRequest`

Once you have created your `CoverageEligibilityRequest`, you need to send it to the insurer.

In addition to sending it directly to the insurer, there are some services that simplify the process. Companies such as Opkit, Availty, and Candid Health allow you to send them eligibility checks directly. They are then checked against an API for coverage to streamline the process.

## Receiving a `CoverageEligibilityResponse`

When you send your request, the insurer will review it and respond. This response will be modeled as a `CoverageEligibilityResponse`.

| **Element**               | **Description**                                                                                                                   | **Code System** | **Example**                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| `status`                  | The status of the response.                                                                                                       |                 | active                                                          |
| `purpose`                 | The reason the initial request was made.                                                                                          |                 | validation                                                      |
| `patient`                 | A reference to the patient the response is for.                                                                                   |                 | Patient/homer-simpson                                           |
| `request`                 | A reference to the original `CoverageEligibilityRequest` this is in response to.                                                  |                 | CoverageEligibilityRequest/check-for-vision-coverage            |
| `outcome`                 | The outcome of the _processing_ of the request. Does NOT answer if the patient is eligible for coverage.                          |                 | complete                                                        |
| `disposition`             | A human-readable description of whether the patient is eligible for coverage.                                                     |                 | The policy is currently in-force.                               |
| `insurer`                 | A reference to the organization that is providing coverage and that sent the response.                                            |                 | Organization/blue-cross                                         |
| `insurance`               | Details about the patient's insurance, including coverage, timing, and benefits.                                                  |                 |                                                                 |
| `insurance.coverage`      | A reference to the patient's coverage resource.                                                                                   |                 | Coverage/example-coverage                                       |
| `insurance.inforce`       | A boolean indicating if the coverage is inforce for the requested period.                                                         |                 | true                                                            |
| `insurance.benefitPeriod` | The term period of the benefits documented in the response.                                                                       |                 | 2023-01-01 – 2023-12-31                                         |
| `insurance.item`          | Details about the benefits, authorization requirements, and current benefits of the insurance.                                    |                 | [See below](#the-item-element-on-a-coverageeligibilityresponse) |
| `error`                   | Documents any errors that encountered during the eligibility check. Describes why a check may not have been able to be completed. |                 | Missing Identifier                                              |

### The `item` Element on a `CoverageEligibilityResponse`

Like its request counterpart, the `CoverageEligibilityResponse` also has an `item` element, however it is a property on the `insurance` element rather than directly on the resource (e.g. `CoverageEligibilityResponse.insurance.item` vs `CoverageEligibilityRequest.item`).

This field has some overlap with the request resource, but there are also significant differences between the two.

| **Property**              | **Description**                                                                 | **Code System** | **Example**                              |
| ------------------------- | ------------------------------------------------------------------------------- | --------------- | ---------------------------------------- |
| `category`                | The general type of the service or product being checked for eligibility.       |                 | Vision Coverage                          |
| `productOrService`        | The product, drug, service, etc. that is being provided.                        | CPT Codes       | 92340 - Fitting of eyeglasses            |
| `provider`                | A reference to the practitioner who is responsible for providing the service.   |                 | Practitioner/dr-alice-smith              |
| `excluded`                | A boolean indicating if the service is excluded from the plan.                  |                 | false                                    |
| `description`             | A more detailed description of the benefits or services that are covered.       |                 | Vision is covered in this policy.        |
| `network`                 | Indicates whether the benefits apply to in-network or out-of-network providers. |                 | in                                       |
| `unit`                    | Indicates whether the benefits apply to an individual or to a family.           |                 | individual                               |
| `term`                    | The term or duration during which service is covered.                           |                 | annual                                   |
| `benefit`                 | A description of the benefits allowed and used to date under the coverage.      |                 | allowedMoney: $10000, usedMoney: $645.99 |
| `authorizationRequired`   | A boolean indicating if authorization is required before providing service.     |                 | true                                     |
| `authorizationSupporting` | Details about additional information or material needed to get authorization.   |                 | Lab Report                               |

<details><summary>Example: A coverage eligibility response for a basic consultation</summary>
  <MedplumCodeBlock language="ts" selectBlocks="eligibilityResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>
