---
sidebar_position: 2
---

# Self-Hosting Best Practices

You've decided to self-host Medplum — great. This guide covers operational practices that will help you run a stable, maintainable deployment and set yourself up for long-term success.

These recommendations come from patterns we've seen across self-hosted deployments, both what works well and what causes pain down the road.

## Infrastructure Organization

### Use a Dedicated Cloud Account

Deploy your Medplum infrastructure in a dedicated cloud account (e.g., an AWS child account under your organization). This provides several benefits:

- **Smaller blast radius**: Medplum resources are isolated from your other workloads
- **Simplified access control**: Easier to grant scoped permissions for audits, compliance reviews, or vendor support
- **Cost visibility**: Clear attribution of Medplum-related infrastructure costs
- **Support readiness**: If you ever need hands-on assistance from the Medplum team, granting temporary access to a dedicated account is straightforward and doesn't expose your broader infrastructure

### Infrastructure as Code

Manage all infrastructure through code (Terraform, CDK, CloudFormation, etc.) rather than manual console changes. This gives you:

- An audit trail of what changed and when
- Reproducible environments for staging and disaster recovery testing
- Easier onboarding for new team members
- The ability to roll back problematic changes

Medplum provides [CDK templates](/docs/self-hosting/install-on-aws) as a starting point. If you diverge from these templates, document your changes and the reasoning behind them.

## Database Management

### Treat the Database as Sacred

The Medplum database schema is managed by the application. Manual changes to PostgreSQL — adding tables, columns, indexes, or modifying data directly — can cause upgrade failures, unexpected behavior, and makes troubleshooting significantly harder.

If you need to make direct database changes:

1. **Document everything**: Keep a log of what was changed, when, why, and by whom
2. **Understand the risks**: Schema modifications may conflict with future Medplum upgrades
3. **Inform support**: If you later engage Medplum for assistance, disclose any manual changes upfront — this information is critical for diagnosis

We strongly recommend treating direct database manipulation as a last resort, not a routine operational tool.

### Plan for PostgreSQL Major Version Upgrades

PostgreSQL major version upgrades (e.g., 14 → 15 → 16) require manual intervention and planning. AWS does not automatically perform major version upgrades for RDS.

- **Schedule regular upgrades**: Don't let your PostgreSQL version fall too far behind. Running an unsupported version limits your options during incidents.
- **Test in staging first**: Major version upgrades can surface compatibility issues. Always test your upgrade path in a non-production environment.
- **Budget the time**: A major version upgrade, including preparation, testing, and execution, typically requires several days of focused effort.

## Observability and Monitoring

Medplum's infrastructure-as-code templates provide the core application components but are intentionally unopinionated about observability. Every organization has different tooling preferences and compliance requirements, so we leave this configuration to you.

That said, **having observability is non-negotiable for production deployments**.

### Minimum Viable Monitoring

At a minimum, instrument monitoring for:

| Component | Key Metrics |
|-----------|-------------|
| Application servers | CPU, memory, disk, network |
| PostgreSQL (RDS) | CPU, memory, connections, replication lag, disk IOPS |
| Redis | Memory usage, connections, evictions |
| Load balancer | Request count, error rates, latency percentiles |

### Recommended Additions

Once basics are covered, consider adding:

- **Application-level metrics**: Requests per second, response time distributions, error rates by endpoint
- **Alerting thresholds**: Alerts that fire *before* you hit critical limits, not after
- **Log aggregation**: Centralized, searchable logs from all components
- **Distributed tracing**: Particularly valuable for debugging slow requests or integration issues

### Tooling Options

Common choices we've seen work well:

- **AWS-native**: CloudWatch metrics, alarms, and dashboards
- **Open source**: Grafana + Prometheus/Loki/Tempo (LGTM stack)
- **Commercial**: Datadog, New Relic, Sumo Logic

We're less concerned about which tool you choose and more concerned that *something* exists. Flying blind in production is how small issues become outages.

## Capacity Planning

### Don't Run Hot

There's a natural temptation to maximize utilization — running servers at 70-80% CPU feels like you're getting good value. The problem is that this leaves no headroom for traffic spikes, garbage collection pauses, or unexpected load.

Our recommendations:

- **Target 40-50% average CPU utilization** on application servers during normal operation
- **Set alerts at 60-70%** to trigger scaling or investigation before you're in trouble
- **Monitor memory pressure**, not just usage — watch for swap activity and OOM kills
- **Right-size your database**: RDS instance types can be changed, but doing so during an incident is stressful

A system with headroom absorbs surprises gracefully. A system running hot turns small spikes into cascading failures.

### Connection Limits

Pay attention to database connection limits, especially as you scale horizontally. Each application server maintains a connection pool, and it's easy to exhaust RDS connection limits without realizing it.

## Backup and Disaster Recovery

### Verify Your Backups

Having automated RDS snapshots enabled is necessary but not sufficient. You should:

- **Test restores periodically**: Actually spin up a database from a snapshot and verify data integrity
- **Document your RTO/RPO**: Know how long recovery takes and how much data loss is acceptable
- **Understand point-in-time recovery**: RDS supports PITR, but you need to know how to use it before an incident

### Multi-AZ and Redundancy

For production deployments, ensure:

- RDS is configured for Multi-AZ deployment
- Application servers span multiple availability zones
- You understand what happens during an AZ failure

## Security Hygiene

### Network Architecture

- Database and Redis instances should **not** be publicly accessible
- Use private subnets for backend services
- Administrative access (SSH, database connections) should go through a bastion host or VPN
- Review security group rules periodically — they tend to accumulate exceptions over time

### Secrets Management

- Store credentials in a secrets manager (AWS Secrets Manager, Parameter Store, HashiCorp Vault) rather than environment variables or config files
- Implement a rotation strategy for database credentials and API keys
- Audit who has access to production secrets

### Patching Cadence

Establish a regular schedule for:

- OS-level security patches on EC2 instances
- Container base image updates if using ECS/Fargate
- Dependency updates in any custom code

## Upgrade Strategy

### Stay Reasonably Current

Drifting too far behind Medplum releases creates compounding problems:

- Security patches don't reach you
- Bug fixes you might need aren't available
- Eventually upgrading requires jumping multiple versions, which is riskier

We recommend staying within **2-3 minor versions** of the latest release.

### Maintain a Staging Environment

Before applying any Medplum upgrade to production:

1. Apply the upgrade to a staging environment that mirrors production
2. Run your test suite and smoke tests
3. Verify integrations still work as expected
4. Only then proceed to production

### Subscribe to Release Notifications

Watch the [Medplum GitHub releases](https://github.com/medplum/medplum/releases) or join the [Discord](https://discord.gg/medplum) to stay informed about new versions, security patches, and breaking changes.

## Document Your Customizations

If you've made modifications beyond the standard Medplum deployment — custom bot dependencies, forked components, unusual configurations, additional services — document them thoroughly.

Future you, your teammates, and anyone providing support will need to understand:

- What was changed from the defaults
- Why the change was made
- Any operational implications

## Getting Help

Even well-run self-hosted deployments occasionally need assistance. To make support engagements productive:

- **Maintain access paths**: The dedicated cloud account structure mentioned earlier pays off here
- **Keep logs accessible**: When something goes wrong, having recent logs available accelerates diagnosis
- **Disclose customizations**: Any manual database changes, forked code, or unusual configurations are relevant

**Questions?** Reach out to the Medplum team at [support@medplum.com](mailto:support@medplum.com) or on [Discord](https://discord.gg/medplum).