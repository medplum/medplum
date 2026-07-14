---
sidebar_position: 1
---

# Self-Hosting vs Cloud

Self-hosting is part of the beauty of open source, and self-hosting Medplum can be the right choice for some teams. However, successful self-hosters of Medplum have highly skilled in-house SRE resources and make significant operational investments in order to maintain their self-hosted clusters. This guide helps you evaluate whether self-hosting aligns with your goals and resources.

# Operational investments when self-hosting

Successful self-hosters of Medplum make hefty investments in maintaining their Medplum clusters.

- Self-hosters are responsible for upgrading their Medplum clusters. Medplum maintains zero-downtime server version upgrades, and from our experience server version upgrades can take one week of an FTE's time for clusters at scale. Failure to maintain regular Medplum cluster upgrades can result in security or compliance issues. Furthermore, new features will not be available unless one upgrades.

- Self-hosters are also responsible for Redis and PostgreSQL right-sizing and upgrades. Failure to properly size clusters at scale can result in degraded performance or downtime. Furthermore, depending on an organization's acceptance of operational downtime, efforts to upgrade Redis and Postgres can range from a couple days to a full month of an FTE's time.

- Your team will take on 24/7 on-call responsibility for outages and need to build incident response protocols, implement observability systems, and maintain all the supporting infrastructure that comes with production systems.

## When Self-hosting Makes Sense

Self-hosting may be compelling for the following reasons:

**Compliance Requirements**
Your implementation includes data sovereignty or contractual obligations that require on-premises deployment, such as EU regulations or US federal government work.

**Low connectivity environments**
Your project has limited data storage / bandwidth requirements and operates in a low-connectivity environment. You might need to run a FHIR server on a medical device you are developing, or on a small machine for a rural clinic, and a lightweight Medplum instance with minimal interactions is sufficient.

**Personal Education**
You want to gain experience with self-hosting infrastructure, and your Medplum instance will only be used for personal projects without production requirements.

## What Medplum Cloud-Hosting Provides

**Managed Operations**
Medplum handles all system maintenance, security updates, and infrastructure scaling so your team can focus on building your healthcare application.

**Log Streaming**
On our cloud-hosted Premium and Enterprise plans, seamless log streaming integration with common observability tools such as SumoLogic and DataDog, providing visibility into your application without managing the underlying infrastructure.

## Already Self-hosting at Scale?

If you're a current self-hosting user that would like to transition to cloud hosting, we're here to help!

**Need assistance?** Contact the medplum team ([support@medplum.com](mailto:support@medplum.com) or [Discord](https://discord.gg/medplum])) with any questions.
