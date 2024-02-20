---
slug: develo-case-study
title: Develo Pediatric EHR
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [pediatrics, fhir-datastore, self-host, ai]
---

# Develo Pediatric EHR

[Develo](https://getdevelo.com/) has built a **full-featured EHR and customer relationship management (CRM)** for pediatrics, encompassing core [scheduling](/docs/scheduling), [clinical](/docs/charting), and [billing](/docs/billing) workflows along with family engagement capabilities.

<iframe width="560" height="315" src="https://www.youtube.com/embed/Jk5jSEiBYbQ?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_(5 minute demo)_

**Outpatient pediatrics** is uniquely family-centered, longitudinal care-driven, and high volume, with distinct well child check-ups and payor mix that is different from other specialties. Accordingly, the Develo product is **beautifully designed** with much attention to the nuances that matter to their core independent pediatric practices market.

![Beautiful growth chart from develo](/img/blog/develo-growth-chart.png)
_(A beautiful pediatric growth chart)_

Develo has built a full stack solution with key innovations around automating **family engagement, reducing administrative tasks, and AI-assisted documentation**.

![Patient intake](/img/blog/develo-intake.png)
_(Intuitive patient intake)_

They rapidly release new capabilities and take a **comprehensive, end-to-end approach** to build a full operating system for pediatrics, rather than just optimizing a narrow set of provider workflows.

![Scheduling order](/img/blog/develo-scheduling-order.png)
_(Scheduling orders)_

Develo EHR is FHIR native and built on Medplum using the following features:

- [Self-hosting](/docs/self-hosting): Develo hosts Medplum in their own AWS.
- [Multi-tenant](/docs/auth/user-management-guide#background-user-model): Develo customers have separate datastores using Medplum projects.

This application is an example of a **software company**, using Medplum to build a custom EHR that delights pediatricians, patients, and families alike. Some screen shots of the applications are shown below.

![Billing experience](/img/blog/develo-billing.png)
_(Even the billing experience shows attention to detail)_
