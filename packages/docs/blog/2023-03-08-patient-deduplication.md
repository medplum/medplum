---
slug: patient-deduplication
title: Patient Deduplication
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [bots]
---

# Patient Deduplication

Patient deduplication is a tough problem, and there are many approaches to implementing a deduplication program. We provide this guide and [sample code](https://github.com/medplum/medplum-demo-bots) as a resource to teams who want to run a continuous deduplication program that is powered by automation and highly auditable.

There are three elements that we see playing a big role in deduplication:

1. New patients evaluated for duplication at time of creation (event driven)
2. Disciplined maintenance of identifiers from different systems
3. Maintaining your de-duplication policy as code

Here is a [5 minute tutorial](https://youtu.be/Umar0gFUMBw) video on deduplication that summarizes the content of this post.

## Event Driven Deduplication

In Medplum, by hooking a [Subscription to the Patient resource](/docs/bots/bot-basics#executing-automatically-using-a-subscription), you can subscribe to the creation of new Patient. This is powerful because it allows you to check each new patient against the existing patient base and flag duplicates in real time.

We suggest making a [Bot](/docs/bots/bot-basics) that listens for new patients and every time a new patient is created evaluation whether they can be merged with an existing patient, creating a duplication risk score or flagging for manual review.

A sample (skeleton) deduplication bot can be found in the [Medplum Demo Bot](https://github.com/medplum/medplum-demo-bots) repository.

## Maintaining Identifiers

Many systems issue patient identifiers, like payors (e.g. United Healthcare), pharmacy and medication systems (e.g. DoseSpot) and even payment providers like Stripe. FHIR support maintaining multiple identifiers from different systems. If you maintain records with patient identifiers from different systems, this can be the basis for detecting duplicates with high accuracy.

The sample deduplication bot test shows a patient with multiple identifiers for reference.

## Policy as Code

The stakes are high for deduplication. A false merge can cause treatment errors, incorrect data disclosure and more. Having an **auditable policy as code**, test coverage, source control and a system with robust audit history is an excellent tool for having that high fidelity deduplication process that is required for great patient care.

## Resources

- [Patient deduplication](https://github.com/medplum/medplum-demo-bots/blob/main/src/deduplication/merge-matching-patients.ts) sample Bot
- [Patient deduplication](https://github.com/medplum/medplum-demo-bots/blob/main/src/deduplication/merge-matching-patients.test.ts) Bot tests
- [Bot Execution via Subscription](/docs/bots/bot-basics#executing-automatically-using-a-subscription)
- [FHIR Multiple Identifiers](/docs/fhir-basics#naming-data-identifiers) documentation
- [Patient](https://app.medplum.com/Patient) resource in Medplum App
