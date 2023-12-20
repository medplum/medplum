---
slug: radai-case-study
title: Rad AI Omni Reporting - Case Study
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [ai, interop, radiology, case-study]
---

## Medplum’s Open-Source FHIRcast Hub Enables Rad AI Omni Reporting's Interactive Measurements

Radiology is a bellwether for innovations in Healthcare IT due to the **time-sensitive** and **data-intensive workflow**. Naturally, radiology applications lead the way in adopting real-time functionality like [FHIRcast](https://fhircast.org/), a WebSockets-based protocol that enables development of highly interactive applications.

Today, we are showcasing the [Rad AI Omni Reporting](https://www.radai.com/omni-reporting) platform, with [FHIRcast support](/docs/fhircast) through Medplum’s open source FHIRcast hub.

<iframe width="560" height="315" src="https://www.youtube.com/embed/N5ZocZhdPZ0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

### How does it work?

Let’s consider an example: a radiologist makes a tumor measurement from a PACS workstation; that measurement can be sent in real-time to the FHIRcast hub as an event. The event is then forwarded to the radiologist’s report editor, where a context-aware description is automatically filled in describing the tumor findings, all without the radiologist ever needing to touch another application or do dictation.

### Why open source?

Proprietary notification systems are a walled garden, and make it difficult or impossible to build highly ergonomic applications. An [open-source FHIRcast hub](https://github.com/medplum/medplum) is a foundational community asset, as developers and vendors can focus on building integrations rather than the plumbing. Open source provides a lot of flexibility for prototyping, testing and integrations across organizations.

### Why FHIR?

Integration is a thorny problem in healthcare overall, and the adoption of standards has been a key tool in allowing system interoperability. Specifically for FHIRcast, **a reference implementation that partners can prototype against** and use without restriction will increase quality and speed of integration.

### Rad AI interactive reporting enabled by FHIRcast

Rad AI Omni Reporting uses the [Integrated Reporting Application (IRA)](https://profiles.ihe.net/RAD/IRA/) spec and Medplum’s open source FHIRcast hub to enable the rich, interactive application seen in the video.

> Rad AI is excited to use open source FHIRcast for context syncing and data passing with our imaging and worklist partners. Having an open-source, standards-based FHIRcast hub lowers the barrier of entry for products to work together.
>
> [John Paulett](https://www.linkedin.com/in/jpaulett) Director of Engineering, [Rad AI](https://www.radai.com/)

## About Rad AI

[Rad AI](https://www.radai.com/) is the fastest-growing radiologist-led AI company. The company was recently listed on the CB Insights’ Digital Health 50 as one of the top privately-owned companies using digital technology to transform healthcare, Digital Health 150 as one of the most innovative digital health startups, and AI 100 as one of the world’s 100 most promising private AI companies. Rad AI won AuntMinnie’s “Best New Radiology Software” in 2023 for Omni Reporting and “Best New Radiology Vendor” in 2021. In 2022, Black Book ranked Rad AI #1 in Mean KPI score on its survey of 50 emerging solutions challenging the healthcare technology status quo.

Founded in 2018 by the [youngest radiologist in U.S. history](https://www.radai.com/about), Rad AI has seen rapid adoption of its AI platform and is already in use at 8 of the ten largest private radiology practices in the U.S. Rad AI uses state-of-the-art machine learning to streamline repetitive tasks for radiologists and automate workflow for health systems, which yields substantial time savings, alleviates burnout, and creates more time to focus on patient care.

## Related Reading

- [IRA Specification](https://profiles.ihe.net/RAD/IRA/)
- [Omni Reporting](https://www.radai.com/news/rad-ai-to-unveil-next-generation-intelligent-radiology-reporting-solution-at-launch-event) Press Release
- [Medplum FHIRcast](/docs/fhircast)
