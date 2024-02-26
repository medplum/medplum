---
slug: titan-case-study
title: AI Driven Patient Intake and EMPI - Titan Case Study
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [ai, interop, scheduling, case-study]
---

# Titan Intake: AI Driven Patient Intake and EMPI

Those who have experienced the wait and shuffle of a specialist referral will appreciate the thoughtful and futuristic approach of the team at [Titan Intake](https://www.titanintake.com/).

<iframe width="560" height="315" src="https://www.youtube.com/embed/sy3YKRFyPII?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_(5 minute demo)_

## Problem

Continuity of care is broken because practices **rely on fax and paper referral workflows to send patients to specialists**. It is unrealistic to expect practices to change their systems, but patients need referrals and practices want to process them faster and capture all of the incoming clinical data without manual data entry.

## Solution

Titan provides a novel solution that leverages [large language models](https://en.wikipedia.org/wiki/Large_language_model) (LLMs) to normalize unstructured referral data to FHIR, and gives practitioners and staff a button to synchronize data to their EHR (Cerner and others) via [FHIR API](/docs/api). This saves manual work by staff and helps patients track the status of their referral. To lighten provider load, the Titan Intake app automatically synchronizes FHIR data to enable faster and more complete chart prepping.

In addition, as part of the intake process, Titan’s [Natural Language Processing](https://en.wikipedia.org/wiki/Natural_language_processing) (NLP) engine detects and predicts the presence of Hierarchical Classification Codes and Elixhauser Comorbities to help both health systems and payors measure and receive reimbursement for the health of their patient populations. These are added to the FHIR Resources as [CodableConcepts](/blog/demystifying-fhir-systems#codeableconcepts).

## Medplum Solutions Used

- Enterprise Master Patient Index (EMPI) - As part of their EMPI implementation Titan checks and [deduplicates patients](/docs/fhir-datastore/patient-deduplication), to prevent the fear of hospital IT - that an integration will introduce duplicates into their system and disturb their reporting and workflow.
- [Interoperability Service](/products/integration) - From their web application, Titan triggers data synchronization into many downstream EHRs like Cerner, NextGen and others. This uses the Medplum [integration engine](/products/integration) a natively multi-tenant system that is very scalable and they serve many providers on the same technical stack.

Here is the full list of [Medplum Solutions](/solutions).

## Challenges Faced

- Extracting data from documents/PDFs and structuring the data as FHIR is a very difficult technical problem. The team employs use of LLMs and modern artificial intelligence techniques to structure and tag the data with code systems.

- Due to the nature of referrals, with a single patient being sent to many different institutions, duplicate [Patient](/docs/api/fhir/resources/patient) resources immediately become an issue. The team built a FHIR native Enterprise Master Patient Index and deduplication pipeline to support this use case.

- Synchronizing to many downstream EHRs, like Cerner and Epic on an event driven basis is difficult because each EHR has slightly different conventions and requirements to accept data.

## Medplum Features Used

- [Bots and Automation](/docs/bots/bot-basics) - to enable the event driven connections between applications and EHRs
- [FHIR Datastore](/docs/fhir-datastore) - to store the data and manage the identities and deduplication
- [Self Hosting](/docs/self-hosting) - [super admin features](/docs/self-hosting/super-admin-guide), and the ability to to manage tenants enables multi-institution access and connections

## Related Reading

- [EMPI Implementation](/blog/empi-implementation) video
- [Patient Deduplication Architectures](/docs/fhir-datastore/patient-deduplication)
- Deduplication reference implementation [code](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/deduplication)
- Case Study: [Codex and the Power of the (g)(10)](/blog/codex-and-the-power-of-g10)
- [CodableConcepts](/blog/demystifying-fhir-systems#codeableconcepts) in FHIR
