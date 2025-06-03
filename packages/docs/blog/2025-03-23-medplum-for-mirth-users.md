---
slug: medplum-for-mirth-users
title: Medplum for Mirth Users
authors: cody
tags: [self-host, integration, interop, community]
---

# Medplum for Mirth Users 

> *Modern Healthcare Integration in the Wake of NextGen's Announcement*

This week, NextGen Healthcare [announced](https://forums.mirthproject.io/forum/mirth-connect/general-discussion/186098-new-era-for-mirth%C2%AE-connect-by-nextgen-healthcare-begins-with-version-4-6) that [Mirth Connect](https://www.nextgen.com/insight/interop/demo/mirth-family-insights), the healthcare integration engine that has been a cornerstone of interoperability for countless organizations, will no longer be available. As long-time healthcare integration engineers ourselves, we recognize this news creates significant uncertainty for the many organizations that rely on Mirth Connect for critical healthcare workflows.

<!-- truncate -->

## Honoring Mirth's Legacy

First, we want to acknowledge Mirth Connect's tremendous contribution to healthcare interoperability. For more than a decade, Mirth has enabled healthcare data exchange for organizations of all sizes, from small clinics to large hospital systems. It helped usher in an era of digital healthcare, and many of us at Medplum have deep experience with Mirth throughout our careers.

## Moving Forward: Why Consider Medplum

As healthcare organizations evaluate their options, we believe Medplum offers a modern, future-proof alternative for many Mirth use cases. While we're developing a comprehensive comparison guide (coming soon), we wanted to highlight some key differences that make Medplum worth considering:

### Cloud-Native Architecture with Local Protocol Support

Mirth's on-premise model required maintaining local servers with all business logic and integration channels running on-site. Medplum takes a different approach:

* [Medplum Agent](/docs/agent): Our lightweight local component converts legacy protocols (HL7, DICOM, ASTM - coming soon!) into secure websockets, eliminating the need for VPNs while maintaining compatibility with local systems.
* Cloud Processing: Complex transformation logic runs in the cloud using modern JavaScript/TypeScript through [Medplum Bots](/docs/bots/bot-basics), improving maintainability and scalability.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/MmE3Dn939B4?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>


### Modern Technology Stack

One of Mirth's challenges has been its reliance on aging Java versions and custom Rhino JavaScript implementations. Medplum is built on a continuously maintained modern tech stack:

* TypeScript/JavaScript: Industry-standard languages that are widely understood and have robust tooling
* Regular Security Updates: Weekly dependency upgrades and proactive security maintenance
* Compliance Ready: SOC2 Type 2 certified with ONC certifications and HITRUST certification in progress

### Open Source
Like Mirth in its early days, Medplum is committed to open source. Our [core platform](https://github.com/medplum/medplum) is Apache 2 licensed, giving you the freedom to use, modify, and deploy as needed without vendor lock-in.

### Designed for Today's Healthcare Integration Challenges
Medplum was built by experienced healthcare engineers who have suffered through the limitations of previous-generation integration engines:

* FHIR-Native: Though we support HL7v2 and other formats, we embrace modern FHIR standards
* Developer Experience: Purpose-built for the way modern healthcare applications are developed
* Scalability: Designed from the ground up for horizontal scaling across cloud environments

## Next Steps for Mirth Users
We understand that migrating from a system as essential as Mirth requires careful planning. In the coming weeks, we'll publish a comprehensive guide for Mirth users considering Medplum, including:

* Detailed feature comparisons
* Migration strategies and patterns
* Technical implementation guidance
* Case studies from organizations who have made similar transitions

In the meantime, we invite you to:

* Join our [Discord community](https://discord.gg/medplum) where you can connect with our team and other healthcare developers
* Explore [our documentation](/docs) to understand Medplum's capabilities
* Try our [sandbox environment](https://app.medplum.com/register) to experiment with the platform

## We're Here to Help
As [fellow healthcare interoperability enthusiasts](/about), we understand the challenges you're facing. Whether you ultimately choose Medplum or another path forward, we're committed to supporting the healthcare integration community through this transition.


Look for our comprehensive Mirth to Medplum comparison guide in the coming days, and please reach out if we can assist with your evaluation process.

<hr />

*Medplum is an open-source healthcare development platform that provides infrastructure and tools for rapidly building compliant healthcare applications. Learn more at medplum.com.*
