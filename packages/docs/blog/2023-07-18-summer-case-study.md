---
slug: summer-case-study
title: 24/7 Pediatrician Access - Summer Health Case Study
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [pediatrics, auth, case-study, ai]
---

# Summer Health: 24/7 Pediatrician Access

<iframe width="560" height="315" src="https://www.youtube.com/embed/H2fJVYG8LvQ?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_(2 minute demo)_

## Introduction

[Summer Health](https://www.summerhealth.com/) is an innovator in direct-to-patient pediatrics, with a focus on messaging and mobile access for parents via SMS. Their fast growing practice is available nationwide and is known for excellent patient engagement.

## Medplum Solutions Used

- [Custom EHR](/solutions/custom-ehr) - The Summer Health custom EHR allows providers to respond to patient messages, enables task management and automation, and has AI-assisted encounter documentation.
- [Patient Portal](/solutions/patient-portal) - The patient experience includes the ability to reach pediatricians via messaging, and to view information across web and mobile devices.
- [FHIR API](/solutions/provider-portal#api-access) - with all data being natively stored as FHIR, enabling synchronization through a FHIR API to Google BigQuery allows robust analytics and visibility into operations.

## Challenges Faced

The unique nature of the Summer Health offering necessitated custom software development, specifically:

- **Messaging-based workflows** are convenient for users, but [require aggregation](/docs/communications/async-encounters), careful data extraction and synthesis to be actionable for providers.
- **Pediatrics requires complex access control patterns** because [patients are children](/docs/fhir-datastore/family-relationships) and multiple caregivers are creating and accessing data on their behalf.
- **Timeliness and [tasking](/docs/careplans/tasks) are crucial** and providers and staff respond in a timely manner to patient inquiries.
- **Mobile access with single sign on for clinicians** who primarily administer care through mobile devices. This was a key pain point with other solutions.

## Why Medplum?

Medplum stood out for the following reasons:

- **Complete control over the user experience**, reducing burden for the providers.
- **Identity management and access control** allows caregivers to access records.
- **Unlimited and flexible integrations**, and ability to build them as needed without restriction, including streamlined incorporation of _**cutting edge technologies like LLMs**_.

The team completed their initial build in 16 weeks.

## Features Used

The following Medplum features were used to build this product.

- [Integrations](/products/integration) - notably Medplum's integration framework and tools made it easy to integrate [BigQuery](https://cloud.google.com/architecture/analyzing-fhir-data-in-bigquery) and LLMs.
- [Google Authentication](/docs/auth/methods/google-auth) and [External authentication](/docs/auth/methods/external-identity-providers) - Summer Health uses multiple identity providers for practitioners and patients respectively.
- [Access policies](/docs/access/access-policies) - Patients are children, so parametrized access policies support parent and caregiver access.
- [Subscriptions](/docs/subscriptions) - integrations to data warehousing and other applications are powered by event driven notifications
- [FHIR Datastore](/docs/fhir-datastore), specifically family relationships and GraphQL allow for medical records that incorporate sibling and family member context
- [Charting](/docs/charting) and [Task Management](/docs/careplans/tasks) - encounter documentation and tasks are featured in the application and major drivers of the workflow.
- [Bulk FHIR API](/docs/api/fhir/operations/bulk-fhir) to support reporting and interoperability with other systems.

## Related Resources

- [Summer Health](https://www.summerhealth.com/) Website
- [Analyze FHIR in Bigquery](https://cloud.google.com/architecture/analyzing-fhir-data-in-bigquery)
- [Open AI Blog features Summer Health](https://openai.com/customer-stories/summer-health)
- [Real Gen AI Use Cases in Healthcare](https://www.youtube.com/watch?v=A5GIMwhOVmk) talk by Matthew Woo on YouTube.
