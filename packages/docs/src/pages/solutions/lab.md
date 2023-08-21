# Lab, LIS and Laboratory Networks

Support **a wide variety of lab use cases** on a unified service. Medplum implementations been cleared by CLIA/CAP as a primary LIS, enable FHIR API access, and help to quickly develop patient portals and provider portals.

## Overview and Problem Space

Diagnostic data is critical to patient care, but due to the human elements like specimen collection and the physician interpretation workflows, lab scenarios require precision and bots. In the lab context, Medplum is used in a number of ways.

- **Primary LIS:** used to power the experience of physicians and lab staff and core to clinical workflow in a CLIA Lab, or multiple CLIA labs
- **Lab Network:** used to send orders to and receive results from multiple labs, but provide a unified interface to customers and partners
- **Diagnostic Results API:** used to give API access to partners for use in their own systems
- **Power a patient portal:** used to give patients access to their records, or let them schedule appointments or phlebotomist visits
- **Power a provider portal:** used to give referring physicians access, both for results review and to place orders.

Recommended reading to enable these use cases is [custom EHR](../solutions/custom-ehr), [provider portal and API](../solutions/provider-portal) and [integrations](../products/integration).

## Features

Medplum provides the following features to enable all of the scenarios described in the previous section. To get the data flow to be automated and customized to your workflow the [bots](../products/bots) feature and the [questionnaires](../products/questionnaires) feature does the heavy lifting.

- **Lab panel management:** this is represented in FHIR as a [PlanDefinition](/docs/api/fhir/resources/plandefinition) and you can see a detailed example in our [github repo](https://github.com/medplum/medplum/blob/main/packages/react/src/stories/covid19.ts).
- **Machine and middleware interfacing:** machines and middleware (e.g. [Data Innovations](https://datainnovations.com/)) run off of HL7 interfaces
- Traditional LIS interfacing: connect to a legacy LIS to receive results, most have an HL7 interface, connected via [bots](/docs/bots/hl7-into-fhir)
- **Diagnostic report PDF and FHIR resource:** are used to deliver results, with custom PDF built via [bots](/docs/bots/creating-a-pdf).

## Enabling Common Lab Integrations

Labs often require multiple integrations to work well, and are high leverage for bots. Below are some examples of services that are integrated to enable sample processing for clinical lab. These integrations are handled through the [integration engine](../products/integration).

- Analyzers (e.g. Roche Cobas Pro)
- Lab middleware (e.g. [Data Innovations](https://datainnovations.com/))
- Legacy LIS system (e.g. [Orchard](https://www.orchardsoft.com/resources/interfaces-system-integration/))
- Logistics services (like for at-home kits, or equipment management, e.g. [Amazon Supply Chain](https://supplychain.amazon.com/))
- Physician network for report review (e.g. SteadyMD, OpenLoop)
- EHR integrations

## Case Studies

- [At Home Diagnostics - Ro Case Study](/blog/ro-case-study)

## Demos and Reference Material

- [CLIA/CAP Checklist](/docs/compliance/clia-cap)
- [Defining your Diagnostic Catalog](/docs/careplans/diagnostic-catalog) shows examples of how to administer panels
- [Defining Reference Ranges](/docs/careplans/reference-ranges) shows how to configure normal, panic and other values for lab
- [Lab Data Model Examples](https://github.com/medplum/medplum/blob/main/packages/react/src/stories/covid19.ts) on Github
- Live Example: [Kit.com developer documentation](https://docs.kit.com/docs/overview)
- [HL7 Bots Tutorial](/docs/bots/hl7-into-fhir) this is the common interface for lab and LIS systems.
- Lab Data Modeling Tutorial (Coming Soon)
