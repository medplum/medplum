---
slug: 2022-year-in-review-medplum
title: Medplum Year in Review 2022
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [integration, fhir-datastore]
---

![2022 in Review](/img/blog/2022-in-review.png)

As we close out 2022, the Medplum team would love to thank our customers and community for joining us on this journey.

We wanted to highlight a few memorable moments and reflect on all that happened during the year. It was a lot of fun, and huge thank you to the team who pushed so hard to make all these things happen.

✅ [Open sourced](https://github.com/medplum/medplum) our repository

✅ Achieved [SOC2 Type 2](/security) and [HIPAA](/docs/compliance/hipaa) certification

✅ First Enterprise customer went live!

✅ Launched our [Youtube Channel](https://www.youtube.com/channel/UCu_sS6aXEHz3GPk2NTugtJA) and [Discord Community](https://discord.gg/medplum)

✅ Had our [YC S22 Demo Day](https://www.ycombinator.com/companies/medplum)

✅ Launched our sample patient portal [Foo Medical](https://www.foomedical.com), [video](https://www.youtube.com/watch?v=aXKWDJ-GBKk), [source code](https://github.com/medplum/foomedical)

✅ [CLIA/CAP](/docs/compliance/clia-cap) Certified

✅ Launched on [Hacker News](https://news.ycombinator.com/item?id=33521560)

✅ 500+ Github Stars

✅ Published our [Roadmap](https://github.com/orgs/medplum/projects/1)

Instead of going on about what the new year has to hold, I'll share a peek into the future in the most Medplum way possible - i.e. in excruciating technical detail. Please enjoy and feedback always welcome.

| Product                                    | 2022                                                                                    | 2023                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Integration](/products/integration)       | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aintegration)    | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Aintegration)    |
| [Questionnaires](/products/questionnaires) | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aquestionnaires) | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Aquestionnaires) |
| [Scheduling](/products/scheduling)         | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Ascheduling)     | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Ascheduling)     |
| [Communications](/products/communications) | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Acommunications) | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Acommunications) |
| [Care Plans](/products/careplans)          | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Acareplans)      | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Acareplans)      |
| [Medications](/docs/medications)           | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Amedications)    | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Amedications)    |
| [Charting](/docs/charting)                 | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Acharting)       | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Acharting)       |
| [Billing/Payments](/products/billing)      | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Abilling)        | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Abilling)        |
| [Auth](/docs/auth)                         | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aauth)           | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Aauth)           |
| [FHIR Datastore](/docs/fhir-datastore)     | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Afhir-datastore) | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Afhir-datastore) |
| [Subscriptions](/docs/subscriptions)       | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Asubscriptions)  | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Asubscriptions)  |
| [React](/docs/react)               | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Areact)          | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Areact)          |
| [Search](/docs/search)                     | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Asearch)         | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Asearch)         |
| [Self-Hosting](/docs/self-hosting)         | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aself-host)      | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Asef-host)       |
| [Compliance](/docs/compliance)             | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Acompliance)     | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Acompliance)     |
| Audit/Logging                              | [Change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aaudit-logging)  | [Roadmap](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3Aaudit-logging)  |
