---
sidebar_position: 1
---

# Self-hosting vs Cloud

Self-hosting Medplum can be the right choice for certain use cases, but it comes with significant operational considerations that organizations may overlook. This guide helps you evaluate whether self-hosting aligns with your goals and resources.

## When Self-hosting Makes Sense

Self-hosting may be appropriate if you have one of these compelling reasons:

**Compliance Requirements**
Your implementation includes data sovereignty or contractual obligations that require on-premises deployment, such as EU regulations or US federal government work. 

**Low connectivity environments**
You might need to run a FHIR server on a medical device you are developing, or on a small machine for a rural clinic, and a lightweight Medplum instance with minimal interactions is sufficient. 

**Learning Project**
You want to gain experience with self-hosting infrastructure, and your Medplum instance will only be used for personal projects without scale requirements.

**Fork Requirements**
You have a [highly compelling technical reason](/blog/so-youre-thinking-about-forking) to fork the Medplum codebase that cannot be addressed through configuration or our extension points.

## Operational Considerations for Self-Hosting

Before choosing self-hosting, it's important to thoroughly assess the ongoing operational responsibilities and resource commitments involved:

**Ongoing Maintenance Burden**
From our experience, you'll need at least 0.5 FTE (full-time equivalent) dedicated to maintaining your Medplum instance during normal quarters. This includes general maintenance for system stability and ensuring you stay current with version upgrades—an area where many self-hosting customers struggle due to competing priorities and loss of organizational knowledge. 

During quarters requiring *large-scale maintenance projects* like PostgreSQL version upgrades or major Medplum version upgrades, resource requirements can scale to 3+ FTEs.

**Operational Responsibilities**
Your team will take on 24/7 pager duty for outages and need to build incident response protocols, implement observability in your cluster, and maintain all the supporting infrastructure that comes with production systems.

## What Medplum Cloud-Hhosting Provides

**Managed Operations**
We handle all system maintenance, security updates, and infrastructure scaling so your team can focus on building your healthcare application.

**Log Streaming**
On our cloud-hosted Premium and Enterprise plans, seamless log streaming integration with common observability tools such as SumoLogic and DataDog, providing visibility into your application without managing the underlying infrastructure.

## Already Self-hosting at Scale?

If you're reading this after already hitting scale and struggling under the operational weight of maintaining your servers, we're here to help. 

**Need assistance?** Contact the medplum team ([support@medplum.com](mailto:support@medplum.com) or [Discord](https://discord.gg/medplum])) with any questions.