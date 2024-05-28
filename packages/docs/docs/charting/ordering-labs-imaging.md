---
sidebar_position: 3
---

# Order Labs and Imaging

Certified EHRs are required to support Computerized Physician Order Entry (CPOE) for Medications Labs and/or Imaging. These correspond to the ONC (a)(1), (a)(2) and (a)(3) criteria and which are described on [HealthIt.gov](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-medications).

This guide will describe how Medplum supports CPOE for Labs and Imaging. The guide for meds will be covered in the [Medications](/docs/medications) section.

## Order Form

Building a custom computerized order form that represents an organization's [Diagnostic Catalog](/docs/careplans/diagnostic-catalog) and enabling the appropriate provider integrations are the first steps to a CPOE workflow. The form itself needs to support capturing the basics of a diagnostic workflow namely:

- Choosing **which tests** to order (e.g. HbA1c) and which provider (e.g. ACME Clinical Lab) to order from
- **Ask on Entry (AOE) questions** - specific to the diagnostic test itself. For example, a common Renal Panel AOE question is to ask whether the patient is fasted or not.
- **Specimen details** - support data capture for specimen collected time as well as details on the specimen itself.
- **Billing and insurance questions** - indicating which account or payor should pay for the test.

This [questionnaire](https://storybook.medplum.com/?path=/story/medplum-questionnaireform--lab-ordering) demonstrates a sample CPOE order form and can be added to your Medplum app or provider facing application to enable an ordering workflow.

## Common Diagnostics Providers

Medplum is provider agnostic and supports connecting to Lab and Imaging orders of all types, assuming an integration is in place. Common integrations can be found in the [integration](/docs/integration) section. Quest, Labcorp and [Health Gorilla](/docs/integration/health-gorilla) are the most frequently enabled.

:::caution
Lab and imaging ordering requires setup. Contact us at [info@medplum.com](mailto:info+diagnostics@medplum.com?subject=enabling%20diagnostic%20providers) to enable a provider.
:::

## Logistics

CPOE should be aware of the logistics workflow a provider wants to enable. Below are **common logistics considerations** and how they effect the CPOE experience.

| Scenario                     | Implications                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Specimen collected on site   | CPOE must collect specimen collected time and details as well as support printing of requisitions to attach to specimens |
| Specimen collected elsewhere | No specimen collection details on the form - patients informed of geographic location of diagnostics provider            |
| At-home lab                  | Patient data must include accurate mailing address                                                                       |

## Related Material

- [Sandbox CPOE video](https://www.youtube.com/watch?v=m0AWpEOh1es)
- [ONC Certification](/docs/compliance/onc)
- [Health Gorilla](/docs/integration/health-gorilla) in integration
- [(a)(2) CPOE Laboratory](https://youtu.be/bb_ISvpcw6o) on Youtube

:::caution

ONC (a)(2),(a)(3) certification is under development.

:::

Certification for (a)(2),(a)(3) is in progress, follow [Github issue](https://github.com/medplum/medplum/issues/3003) for updates.
