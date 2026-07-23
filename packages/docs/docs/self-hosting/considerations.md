---
sidebar_position: 1
---

# Should you Self-Host?

Self-hosting is part of the beauty of open source, and self-hosting Medplum can be the right choice for some teams. However, successful self-hosters of Medplum have highly skilled in-house SRE resources and make significant operational investments in order to maintain their self-hosted clusters. This guide helps you evaluate whether self-hosting aligns with your goals and resources.

## The Cost of Self-Hosting at Scale

Self-hosting Medplum means owning the full operational lifecycle of a production healthcare system. From our experience with self-hosters, here is what it looks like month to month.

**Continually upgrading your Medplum cluster.** Medplum [ships frequently](/docs/compliance/versions), and every release is your team's responsibility to roll out. At scale, a single server version upgrade can run from one week to one month (depending on minor/major versions) of a dedicated engineer's time, on a recurring basis. Falling behind on upgrades can make them riskier: you'll have to upgrade across larger version gaps sequentially, and your team may be sitting on compliance fixes that haven't been applied yet. Any new Medplum feature your roadmap depends on is not available until you've upgraded.

**Owning the infrastructure layer.** Redis and PostgreSQL are fundamental to your Medplum cluster, and right-sizing and upgrading them is a continuous effort. As your traffic grows, incorrect hardware sizing can result in degraded performance or outright downtime. Major version upgrades of Redis and Postgres, depending on your organization's tolerance for downtime, can take anywhere from a couple days to a full month of a dedicated engineer's time.

**Staffing on-call coverage.** Production healthcare systems are used on nights and weekends, and your team will need 24/7 on-call coverage for outages. Beyond the upfront work of building incident response protocols and standing up observability and alerting, this is a continuous operational load: staffing on-call rotations, maintaining all supporting infrastructure, and responding to incidents as they occur. We've seen self-hosting customers struggle to diagnose the root cause of an incident quickly or independently, given their teams don't have the same level of institutional knowledge as the engineers who built and maintain the system every day - which counts against recovery time during an active outage.

## Why Medplum Operates Medplum Efficiently

The operational costs above are not evenly distributed. The same work is substantially cheaper for the team that builds and operates Medplum full-time than it is for a self-hosting team doing it alongside their primary product.

**We built the system.** Medplum's maintainers wrote the server, the upgrade paths, and the database migrations. When an upgrade behaves unexpectedly or an incident occurs, we are diagnosing code we know, not reverse-engineering an unfamiliar system under time pressure. Root-cause analysis that can take a self-hosting team hours is often immediate for us.

**We operate one well-understood fleet.** We run on-call, monitoring, and alerting across all our hosted users, so the same practices, dashboards, and runbooks cover all of them. A self-hoster builds and staffs this for a single deployment; we amortize it across our entire user fleet, which is why our per-organization operational cost is lower than any individual team's.

**We have the organizational knowledge.** Upgrade playbooks, database right-sizing patterns, and a history of past incidents and their resolutions are institutional knowledge accumulated across every cluster we run. A self-hosting team starts this from scratch and rebuilds it on their own, whereas for us it already exists and compounds with every deployment we operate.

## When Self-Hosting Makes Sense

Self-hosting is the right choice for a specific set of cases. These share a common thread: a hard requirement that cloud hosting cannot satisfy, or a deployment small enough that the operational costs above do not apply.

**Regulatory or contractual constraints.** Your deployment is subject to data sovereignty requirements or contractual obligations that mandate a specific hosting environment — for example, US federal government work required to be on-prem. When the requirement is absolute, self-hosting may be the only option that meets it. For deployments with data sovereignty requirements, [contact us](mailto:support@medplum.com), as we may be able to meet them on Medplum Cloud.

**Low-connectivity or edge deployments.** Your deployment runs in an environment with limited bandwidth or intermittent connectivity, and has modest data and storage needs. Examples include a FHIR server embedded in a medical device or a lightweight instance running on a small machine in a rural clinic. In these cases a minimal Medplum instance is sufficient, and the operational burden is correspondingly small.

**Education and non-production use.** You want hands-on experience with self-hosting infrastructure, or you are running Medplum for personal or evaluation projects with no production requirements. Without production traffic, uptime commitments, or compliance obligations, the operational costs above largely do not apply.

## What Medplum Cloud Provides

Medplum Cloud removes the operational burden described above and replaces it with a managed environment maintained by the team that builds Medplum.

**Managed operations.** We handle system maintenance, security updates, upgrades, and infrastructure scaling. Your team builds your healthcare application; we keep the platform underneath it running.

**Inherited compliance.** Medplum Cloud is operated to meet healthcare compliance standards, including our ONC Health IT certification. See the [Medplum Trust Center](https://trust.medplum.com/) for the full suite of certifications attached to Medplum's hosted environment and how we operate it, not the open-source code itself.

**Log streaming.** On our Premium and Enterprise plans, logs stream directly to common observability tools such as SumoLogic and Datadog, giving you visibility into your application without operating the logging infrastructure yourself.

## Already Self-Hosting at Scale?

If you're a current self-hosting user that would like to transition to cloud hosting, we're here to help!

**Need assistance?** Contact the Medplum team ([support@medplum.com](mailto:support@medplum.com) or [Discord](https://discord.gg/medplum)) with any questions.
