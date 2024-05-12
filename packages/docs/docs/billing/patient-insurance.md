---
sidebar_position: 2
tags:
  - billing
  - insurance
  - coverage
keywords:
  - insurance coverage
  - copay
  - fhir
---

import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Example from '!!raw-loader!@site/../../examples/medplum-demo-bots/src/candid-health/send-to-candid.test.ts';

# Representing Patient Insurance Coverage

## Introduction

The [`Coverage`](/docs/api/fhir/resources/coverage) resource represents high-level insurance information for a patient, similar to what would be found on their insurance cards.

This guide will go over the most relevant elements of [`Coverage`](/docs/api/fhir/resources/coverage) for digital health providers and is primarily focused on the U.S. system.

The guide aligns with recommendations from two implementation guides

- [US Core Guidelines](https://www.medplum.com/docs/fhir-datastore/understanding-uscdi-dataclasses) - these are guidelines developed by the U.S. government and serve as the basis for all FHIR implementations in the U.S.
- [CARIN Digital Insurance Card Guide](http://hl7.org/fhir/us/insurance-card/) - CARIN is a industry group, including members from Humana, Blue Cross, and Mitre, that expands upon the U.S. Core.

## Subscribers vs. Beneficiaries

In FHIR's [`Coverage`](/docs/api/fhir/resources/coverage) resource, a distinction is made between plan subscribers and beneficiaries.

The `Coverage.subscriber` element denotes the individual who has subscribed to the plan, often also known as the "policyholder".

The `Coverage.beneficiary` element, on the other hand, refers to the person who is eligible to receive healthcare services under the plan.

The `Coverage.relationship` element describes how the subscriber and beneficiary are related. The US Core guidelines recommend that this code should be selected from the [HL7 subscriber relationship valueset](http://hl7.org/fhir/R4/valueset-subscriber-relationship.html).

:::note Example

Consider an example where Mr. John Doe, an employee at a company, has an insurance policy that covers his family, including his daughter, Jane Doe. When representing Jane's insurance coverage, she would be listed as the `Coverage.beneficiary`, John would be listed as the `Coverage.subscriber`, and the `Coverage.relationship` would be set to `'child'`.

:::

## Insurance Member ID

The US Core implementation of FHIR mandates every [`Coverage`](/docs/api/fhir/resources/coverage) to have an insurance member ID for the _subscriber_. This identifier can be included in one of two elements: `Coverage.subscriberId` or `Coverage.identifier`.

If you decide to use `Coverage.identifier`, US Core requires that `Coverage.identifier.type` is drawn from the [HL7 identifierType code system](https://terminology.hl7.org/5.2.0/CodeSystem-v2-0203.html) with code `MB`. Check out the [example below](#example) for an example.

## Plan Types and Payors

One of the most important fields in the Coverage resource is the plan type (`Coverage.type`). The United States offers many different types of insurance plans, including Health Maintenance Organizations (HMOs), Preferred Provider Organizations (PPOs), government employee programs, veteran's insurance, and many others. Each of these plan types has a distinct set of benefits and billing structures.

The US Core guidelines strongly encourage the use of the [Source of Payment Typology (SOPT)](https://www.nahdo.org/sopt) code system for classifying US plan types. These SOPT codes are a hierarchical system of numeric codes that classify most US health plans.

Another required field is `Coverage.payor` , which indicates the company or institution who will reimburse the provider for care. This should a reference to an [`Organization`](/docs/api/fhir/resources/organization) resource, to allow for search queries of all patients insured by the same payor.

:::tip Representing self-pay / cash-pay

Many digital providers have a significant patient population that pay out-of-pocket. It is a best practice to create [`Coverage`](/docs/api/fhir/resources/coverage) resources for these patients as well, to allow flexible handling of their [coverage stack](#primary-vs-secondary-coverage) as their insurance situation evolves.

A self-pay patient's [`Coverage`](/docs/api/fhir/resources/coverage) should set `subscriber`, `beneficiary`, `relationship`, `type`, and `payor` as follows:

```ts
{
  resourceType: 'Coverage',
  //...
  type: {
    text: 'Self-pay'
    coding: [
      {
            system: 'https://nahdo.org/sopt',
            code: '81',
            display: 'Self-pay (Includes applicants for insurance and Medicaid applicants)',
          },
    ],
  },
  subscriber: {
    reference: 'Patient/example-patient',
  },
  beneficiary: {
    reference: 'Patient/example-patient',
  },
  relationship: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
        code: 'self',
        display: 'Self'
      },
    ],
  },
  payor: [
    {
      reference: 'Patient/example-patient',
    },
  ],
  //...
};

```

:::

## Plan Classifications: Group, Plan Name, RXBIN, RXPCN

Most insurance cards have a set of codes, known as "classifiers", that identify important billing information for the subscriber's plan.

The `Coverage.class` is used to store these classification values in an array of (`type`, `value`, `name` ) tuples.

FHIR recommends using the [coverage class valueset](https://hl7.org/fhir/R4/codesystem-coverage-class.html) to represent the class type. Below is a table of the coverage class codes in this valueset.

| **Code**                                                                                  | **Definition**                                                              |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [group](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-group)       | An employee group                                                           |
| [subgroup](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-subgroup) | A sub-group of an employee group                                            |
| [plan](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-plan)         | A specific suite of benefits.                                               |
| [subplan](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-subplan)   | A subset of a specific suite of benefits.                                   |
| [class](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-class)       | A class of benefits.                                                        |
| [subclass](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-subclass) | A subset of a class of benefits.                                            |
| [sequence](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-sequence) | A sequence number associated with a short-term continuance of the coverage. |
| [rxbin](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-rxbin)       | Pharmacy benefit manager's Business Identification Number.                  |
| [rxpcn](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-rxpcn)       | A Pharmacy Benefit Manager specified Processor Control Number.              |
| [rxid](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-rxid)         | A Pharmacy Benefit Manager specified Member ID.                             |
| [rxgroup](http://hl7.org/fhir/R4/codesystem-coverage-class.html#coverage-class-rxgroup)   | A Pharmacy Benefit Manager specified Group number.                          |

Refer to our [example below](#example) for a [`Coverage`](/docs/api/fhir/resources/coverage) resource that is tagged with multiple classifier codes.

## Patient Costs and Copays

Healthcare in the U.S often involves cost-sharing measures with patients, commonly referred to as "copays" or "co-insurance". These measures represent the portion of healthcare costs that the patient is responsible for, separate from what the insurance covers.

In FHIR, these cost-sharing measures can be represented using the `Coverage.costToBeneficiary` field, which is an array of such cost-sharing provisions. The [CARIN Digital Insurance Card guide](http://hl7.org/fhir/us/insurance-card/) (a superset of the US Core guidelines) recommends a set of standard codes for the `costToBeneficiary.type` field in the [C4DIC Extended Copay Type](http://hl7.org/fhir/us/insurance-card/CodeSystem-C4DICExtendedCopayTypeCS.html) value set. This value set provides a comprehensive list of codes to represent most common cost-sharing provisions in the U.S.

:::tip Representing Cost Sharing Measures as Text

In certain scenarios, cost-sharing provisions may not be easily representable as numeric or monetary values. The CARIN guide offers the [Beneficiary Cost as String](http://hl7.org/fhir/us/insurance-card/StructureDefinition-C4DIC-BeneficiaryCostString-extension.html) extension to represent these these provisions as text strings. It is then up to the client's billing engine to interpret this string when adjudicating claims for reimbursement. The `rx` provision in our [example below](#example) below demonstrates how to use this extension.

:::

See our [detailed example below](#example) for a comprehensive example representation of these cost-sharing provisions.

## Primary vs. Secondary Coverage

Some patients may have multiple forms of reimbursement, forming a "coverage stack" for any given procedure. For patients with multiple sources of insurance, FHIR uses the `Coverage.order` element to represent the order of use of the patient's coverages. The `order` attribute is an integer, with the primary insurance given the value of `1`, secondary insurance a value of `2`, and so forth.

It's crucial to correctly assign these numbers as they indicate to the billing system the sequence in which the coverages are to be applied.

:::tip A note on Co-pay cards

Some manufacturers will offer [co-pay cards](https://www.goodrx.com/healthcare-access/drug-cost-and-savings/what-are-manufacturer-copay-cards) to reimburse patients for their out-of-pocket costs for certain drugs. These cards can be modeled as additional [`Coverage`](/docs/api/fhir/resources/coverage) resources, with higher / lower priority on the coverage stack, as appropriate.

To date, the community has not yet aligned on a standard for modeling patient reimbursements (rather than costs). Medplum is working with the FHIR community to define a standard, and currently recommends using a negative value for `Coverage.costToBeneficiary.value[x]`.

:::

## Storing Insurance Card Photos

Digital health implementations often need to store photos of a patient's insurance card, alongside their coverage information. While FHIR does not support the direct storing of images within the Coverage resource, you can use the `DocumentReference` resource to store the image and connect it to the [`Coverage`](/docs/api/fhir/resources/coverage) using the `DocumentReference.context.related` element. See our guide on [handling external files](https://www.medplum.com/docs/charting/external-documents) for more information.

## A Detailed Example {#example}

Below is a detailed example of a [`Coverage`](/docs/api/fhir/resources/coverage) resource, tagged with the appropriate code systems. This example conforms to the US Core guidelines.

This example has been tested as part of the the [Medplum Candid Demo Bot](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/candid-health), a [Medplum Bot](/docs/bots) that submits insurance information to [Candid Health](https://www.joincandidhealth.com/) for reimbursement. Check out the [full bot](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/candid-health/send-to-candid.ts) for an example of how to submit FHIR resources to the Candid API.

<MedplumCodeBlock language="ts" selectBlocks="exampleCoverage">
    {Example}
</MedplumCodeBlock>

## See Also

- [US Core Guidelines](https://www.medplum.com/docs/fhir-datastore/understanding-uscdi-dataclasses)
- [CARIN Digital Insurance Card Guide](http://hl7.org/fhir/us/insurance-card/)
- [Medplum Candid Demo Bot](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/candid-health)
