---
sidebar_position: 1
---

# Self-Hosting vs Cloud

Self-hosting Medplum can be the right choice for certain use cases, but it comes with significant operational considerations that organizations may overlook. This guide helps you evaluate whether self-hosting aligns with your goals and resources.

## When Self-hosting Makes Sense

Self-hosting may be compelling for the following reasons:

**Compliance Requirements**
Your implementation includes data sovereignty or contractual obligations that require on-premises deployment, such as EU regulations or US federal government work. 

**Low connectivity environments**
Your project has limited data storage / bandwidth requirements and operates in a low-connectivity environment. You might need to run a FHIR server on a medical device you are developing, or on a small machine for a rural clinic, and a lightweight Medplum instance with minimal interactions is sufficient. 

**Personal Education**
You want to gain experience with self-hosting infrastructure, and your Medplum instance will only be used for personal projects without production requirements.

## Operational Considerations for Self-Hosting

Before choosing self-hosting, it's important to thoroughly assess the ongoing operational responsibilities and resource commitments involved:

**Ongoing Maintenance**
Maintaining any self-hosted system requires dedicated attention to ensure stability and keep up with updates. For Medplum, we recommend designating internal resources to manage ongoing operations and version upgrades, as this proactive approach helps prevent common challenges and ensures you can fully leverage new features.

We estimate that organizations need approximately 0.5 FTE (full-time equivalent) dedicated to maintaining your Medplum instance during normal quarters. During *large-scale maintenance projects* like PostgreSQL version upgrades or major Medplum version upgrades, resource requirements may increase. 

**Operational Responsibilities**
Your team will take on 24/7 on-call responsibility for outages and need to build incident response protocols, implement observability systems, and maintain all the supporting infrastructure that comes with production systems.

## What Medplum Cloud-Hosting Provides

**Managed Operations**
Medplum handles all system maintenance, security updates, and infrastructure scaling so your team can focus on building your healthcare application.

**Log Streaming**
On our cloud-hosted Premium and Enterprise plans, seamless log streaming integration with common observability tools such as SumoLogic and DataDog, providing visibility into your application without managing the underlying infrastructure.

## Already Self-hosting at Scale?

If you're a current self-hosting user that would like to transition to cloud hosting, we're here to help!

**Need assistance?** Contact the medplum team ([support@medplum.com](mailto:support@medplum.com) or [Discord](https://discord.gg/medplum])) with any questions.