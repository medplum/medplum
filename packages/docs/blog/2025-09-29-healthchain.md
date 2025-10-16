---
slug: healthchain
title: 'HealthChain: A New Open Source Integration with Epic'
authors: cody
tags: [fhir-datastore, security, auth, community]
---

# HealthChain: A New Open Source Integration with Epic

We're excited to share a new open-source project from the community that addresses a common developer challenge: integrating with legacy healthcare systems. [HealthChain](https://dotimplement.github.io/HealthChain/), an open-source Python framework, makes it easier to connect AI/ML pipelines to healthcare systems.

This project is a perfect example of how the open-source community is tackling real-world problems. It was created by [Jennifer Jiang-Kells](https://jenniferjiangkells.com/), an honorary researcher at the [University College London Hospitals](https://www.uclhospitals.brc.nihr.ac.uk/) (UCLH) NHS Foundation Trust, highlighting its roots in a premier healthcare institution.

<!--truncate-->

### Connecting Epic to Medplum

One of HealthChain's most useful examples is a "Note Reader" service that integrates **Epic NoteReader** with Medplum. This demo shows how to process clinical notes, extract data like billing codes, and map them to the FHIR format. This addresses a key pain point for developers who need to modernize data workflows without replacing their existing Epic infrastructure.

By connecting Epic NoteReader to a modern FHIR server like Medplum, this project demonstrates a practical, open-source solution for developers. It's a powerful tool for bridging the gap between legacy CDA systems and modern healthcare platforms.

### Get Started

We encourage you to explore the project and see what's possible.

- HealthChain: https://dotimplement.github.io/HealthChain/
- Clinical Coding Demo: https://dotimplement.github.io/HealthChain/cookbook/clinical_coding/
