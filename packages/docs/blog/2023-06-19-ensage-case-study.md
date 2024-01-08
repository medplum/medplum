---
slug: ensage-case-study
title: Value Based Care and Elderly Populations - Ensage Case Study
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [interop, fhir-datastore, compliance, case-study, geriatrics]
---

# Ensage Case Study: Risk Management for Elderly Populations in Value-Based Care Settings

<iframe width="560" height="315" src="https://www.youtube.com/embed/GIlmd7OMZ5g?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_(2 minute demo)_

## Introduction

[EnSage](https://www.ensagehealth.com/), is an innovator in healthcare management, improves outcomes for elderly populations in value-based care (VBC) organizations. Their service automates the acquisition of patient data from multiple sources and performs data-driven risk-scoring on each patient. The risk scores then aid the care team in scheduling check ups for the highest risk patients first. It also facilitates sharing these risk profiles with their Primary Care Providers, enabling high fidelity care coordination across institutions.

## Medplum Solutions Used

In this project, EnSage utilized two Medplum solutions.

1. **[Custom EHR](/solutions/custom-ehr)**: A health record application specifically tailored for EnSage practitioners. This provides healthcare professionals with vital data at their fingertips.
2. **[Provider Portal and FHIR API](/solutions/provider-portal)**: An application for referring physicians to access and contribute to the integrated care management, but ensures they only have access (via API or app) to patients under their care.

## Challenges Faced

EnSage overcame significant technical challenges in this project, including the need to aggregate data from a wide array of sources such as claims data, CMS datasets, and more. Additionally, they required a bespoke workflow that incorporated case management across multiple organizations that necessitated sophisticated access controls.

They completed their initial build in 16 weeks.

## Why Medplum?

Medplum stood out due to its [out-of-the-box auth service](/docs/auth/methods/external-identity-providers) that supports cross-organization access. Its ability to build high-fidelity custom integrations quickly also proved invaluable in overcoming the challenges of collecting and synchronizing data from multiple sources.

The [FHIR data model](/docs/api/fhir/resources) also proved valuable, as a well documented data model supported by EHRs aligned stakeholders quickly.

These factors allowed EnSage to focus on what was most important: their risk scoring algorithms and the clinician experience.

## Features Used

EnSage leveraged a suite of Medplum features to create a comprehensive and efficient solution:

1. [Authorization](/docs/access/access-policies): by leveraging Medplum sophisticated [access control](/docs/access/access-policies#healthcare-partnerships) system, the EnSage team was able to expose the Medplum FHIR API directly to client applications and external partners, without the need to encapsulate it behind a gateway / proxy.
2. [Authentication](/docs/auth): Multiple authentication providers were utilized, with the EnSage team using [Google Authentication](/docs/auth/methods/google-auth), while referring physician identities were managed in an [Auth0 tenant](/docs/auth/methods/external-identity-providers).
3. [FHIR Datastore](/docs/fhir-datastore): All data is stored in FHIR format and is accessible via the FHIR API. This provides a standardized approach to storing and accessing health information.
4. [Subscriptions](/docs/subscriptions): In this implementation, in response to [questionnaires](/docs/questionnaires/basic-tutorial), subscriptions are triggered, setting off automated workflows like notifications, data synchronization and more.
5. [Scheduling](/docs/scheduling): Integration between [Acuity](https://www.acuityscheduling.com/) and [FHIR Schedule](/docs/api/fhir/resources/schedule) provided a robust solution for managing appointments and optimizing healthcare service delivery.
6. [Charting](/docs/charting): A system for documenting encounters, including details like CPT and diagnosis codes, was created. This facilitated a comprehensive and precise record-keeping process.
7. [Billing and Revenue Cycle](/docs/billing): An automated integration with [Candid Health](https://github.com/medplum/medplum-demo-bots/tree/main/src/examples/candid-health) enabled Medicare (CMS) billing for providers on the platform.
8. [Open source](https://github.com/medplum/medplum): The development team used Typescript for the entire stack. The Medplum open source code, [issue tracking](https://github.com/medplum/medplum/issues) and community features helped streamline development and speed learning.

Below is an architecture diagram showing how the different components fit together.

![Ensage system diagram](/img/blog/ensage-platform-architecture.jpg)
[Click to enlarge](/img/blog/ensage-platform-architecture.jpg)

In conclusion, Medplum was instrumental in providing the tools and support needed to address the complex challenges faced by EnSage. The result is an efficient, patient-centered system that ensures proactive care for elderly populations in value-based care settings.

## Related Resources

- Implementation partner: [AlleyCorp Nord](https://alleycorpnord.com/)
- Tech leads: [Julien Blin](https://ca.linkedin.com/in/julienblin), [Florencia Herra Vega](https://ca.linkedin.com/in/flohdot)
- [BonFHIR Toolkit](https://bonfhir.dev/) is featured in this application
- [Download Case Study](https://drive.google.com/file/d/1X1m5EcS1FIytt949oUbOrrAgEFIj5QR6/view?usp=sharing) as PDF
