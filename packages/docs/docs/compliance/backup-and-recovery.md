---
sidebar_position: 11
sidebar_label: Backup & Recovery
keywords:
  - backup
  - retention
  - disaster recovery
  - high availability
  - RTO
  - RPO
---

# High Availability, Backup, and Retention

This page describes how customer data survives failure on the **hosted** platform: how the system stays available when infrastructure breaks, how data is backed up, what happens in a regional disaster, and how long data is kept.

These controls are covered in detail by Medplum's SOC 2 Type II report and HITRUST certification. This page is a plain-language summary intended for security reviews and vendor questionnaires. For self-hosted deployments, see [Disaster Recovery](/docs/self-hosting/disaster-recovery) instead, since the customer operates the infrastructure and therefore owns these controls.

## Summary

| Question                           | Answer                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| What keeps data from being lost?   | Live redundancy first, backups second                                           |
| What happens when hardware fails?  | Automatic failover in seconds, with no restore and no data loss                 |
| How current are the standbys?      | About 20 ms in-region; about 100 ms cross-region                                |
| Is data replicated across regions? | Yes, continuously to a second US region                                         |
| Does data leave the United States? | No                                                                              |
| Are backups taken as well?         | Yes, daily snapshots plus continuous point-in-time recovery over a 7-day window |
| How long is data retained?         | Indefinitely, unless you delete it                                              |
| Are deletes recoverable?           | Yes, FHIR deletes are soft deletes by default                                   |
| Recovery Time Objective (RTO)      | Under 1 hour                                                                    |
| Recovery Point Objective (RPO)     | Under 1 hour                                                                    |
| Are backups tested?                | Yes, at least annually, as part of the business continuity program              |

## How the platform survives failure

Medplum's hosted platform is built so that data survives failure at several levels. The important point, and the one most often misunderstood in security reviews, is that **the main line of defense is live redundancy, not backups**.

Every committed write is replicated to standby database instances within roughly 20 milliseconds, and to a second AWS region within roughly 100 milliseconds. Those standbys are not cold archives. They are running instances, serving read traffic, already holding the data. When hardware fails, the platform **fails over** to one of them. Nothing is restored, because nothing was lost.

Backups are the second tier, and they exist for the one category of problem replication cannot solve: **logical damage**. A bad migration or an erroneous bulk delete is a technically valid write, so replication copies it faithfully to every replica in milliseconds. Point-in-time recovery is the only defense against that class of event. That is what backups are for, not routine recovery.

| Layer                  | Mechanism                                                                        | Protects against                                     | How recovery works             |
| ---------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| Live, in-region        | Multiple reader instances across Availability Zones, ~20 ms behind the writer    | Instance failure, Availability Zone failure          | Automatic failover, in seconds |
| Live, cross-region     | Aurora Global Database replicating to a second region, ~100 ms behind            | Loss of an entire AWS region                         | Promote the secondary cluster  |
| Point-in-time recovery | Continuous capture across a rolling 7-day window                                 | Logical damage: bad migration, erroneous bulk delete | Restore to a chosen second     |
| Daily snapshots        | Automated daily, 7-day retention, plus manual snapshots before major maintenance | Logical damage, plus fixed reference points          | Restore from a snapshot        |

Restoring from a snapshot is an extreme and infrequent event. In normal operation, and in the large majority of failure scenarios including the loss of an entire data center, no restore takes place at all.

## Layer 1: Live redundancy and failover

### Database

The production database is Amazon Aurora PostgreSQL, running one primary writer instance alongside multiple reader instances distributed across AWS Availability Zones. Storage is encrypted at rest.

Replication lag to the in-region readers is typically about **20 milliseconds**. Within that window, every committed write exists on multiple instances in multiple physically separate data centers. If the writer fails, a reader is promoted automatically, and the promotion is close to instantaneous from a client's perspective.

### Cross-region replication

The cluster is configured as an **Aurora Global Database**, replicating continuously from the primary region, US East (N. Virginia), to a secondary region, US West (Oregon). Observed cross-region replication lag is typically **100 to 120 milliseconds**. That figure is close to the physical floor for the distance involved: a signal cannot cross the continent and return faster than the speed of light in fiber.

Binary data in Amazon S3 is likewise replicated to the secondary region as objects are written.

All hosted customer data remains within the United States.

### Compute and cache

The stateless tiers are redundant in the same way.

- Application servers run on Amazon ECS behind load balancers. Unhealthy tasks are removed from service and replaced automatically.
- The cache tier runs with Multi-AZ enabled and a standby replica, and fails over automatically. Data is encrypted in transit and at rest.

Because the application tier holds no durable state, replacing an instance is routine and carries no risk of data loss.

## Layer 2: Backups

Backups exist for changes that are technically valid but logically wrong, which replication faithfully propagates. They are also the mechanism behind long-lived recovery points and the evidence Medplum's auditors examine.

### Database backups

- **Automated daily snapshots**, taken during a fixed early-morning maintenance window.
- **Continuous point-in-time recovery** across a rolling **7-day** window. Recovery is not limited to snapshot boundaries; the cluster can be restored to any point in time inside that window.
- **Manual snapshots before major maintenance.** Before a major-version database upgrade, a manual snapshot is taken and retained beyond the 7-day automated window.

### Binary storage

Binary data is stored in Amazon S3, which is designed for **99.999999999% durability** and 99.99% availability of objects over a given year.

**Object versioning is enabled** on the storage bucket. Every overwrite creates a new version rather than replacing the old one, and every delete creates a delete marker rather than destroying data, so accidental overwrites and deletions are recoverable. The bucket is encrypted at rest, blocks all public access, and requires TLS for every request.

### Logs

Application logs are stored in Amazon CloudWatch Logs, a managed and replicated service, with retention set to never expire. `AuditEvent` records persisted as FHIR resources live in the primary database and are therefore covered by everything described above.

Customers who need logs held under their own retention schedule, or in their own SIEM, can stream them to an external destination. See [Customer controls](#customer-controls) below.

## Recovery objectives

Medplum's standard recovery objectives for the hosted platform are:

| Objective                      | Target       | Meaning                                              |
| ------------------------------ | ------------ | ---------------------------------------------------- |
| Recovery Time Objective (RTO)  | Under 1 hour | Maximum time to restore service                      |
| Recovery Point Objective (RPO) | Under 1 hour | Maximum data loss measured backward from the failure |

These are deliberately conservative commitments for the worst case, a total loss of an entire AWS region. Because the secondary region is continuously replicated rather than restored from a snapshot, expected data loss in an actual regional failover is measured in milliseconds, not the one hour the objective allows.

Most publicly reported AWS "outages" are partial degradations of individual services rather than complete regional loss. Those are absorbed by the automatic failover behavior described in Layer 1, without declaring a disaster or invoking these objectives at all.

:::warning[IMPORTANT]

RTO and RPO targets are documented in Medplum's Business Continuity and Disaster Recovery policy. Contractual commitments, if any, are defined in your customer agreement. This page is documentation, not a contract.

:::

## Data retention

By default, **Medplum retains all customer data indefinitely unless it is explicitly deleted**. There is no automatic expiration, and Medplum does not delete customer data on its own schedule.

Retention behaves slightly differently across the three kinds of data on the platform.

### FHIR data

FHIR resources (patients, encounters, observations, and everything else) are stored in the primary database and retained indefinitely.

The FHIR `delete` operation performs a **soft delete**. The resource stops appearing in searches and reads return `HTTP 410 Gone`, but the prior versions remain in the resource history and can still be read. A soft delete is therefore recoverable without involving Medplum support.

When data must be destroyed rather than hidden, the [`$expunge`](/docs/api/fhir/operations/expunge) operation permanently removes a resource and its entire history from the database. This is irreversible and is the correct tool for regulatory deletion requests. See [Deleting Data](/docs/fhir-datastore/deleting-data) for the full comparison of soft and hard deletes.

### Binary data

Documents, images, and other binary content are stored in Amazon S3 and retained indefinitely under the same policy.

### Logs and audit events

Medplum records access to protected health information as [`AuditEvent`](/docs/api/fhir/resources/auditevent) records, and these can be captured in two independent places:

- **As FHIR resources in the database.** These are stored, indexed, and searchable like any other resource. They are retained indefinitely, are covered by the database backups described below, and can be queried through the normal FHIR API.
- **As entries in the application log stream.** These are captured in Amazon CloudWatch Logs, where the log groups are configured to never expire.

The two are not redundant. The FHIR resource is the durable, queryable audit record. The log stream is the operational trail, and is the path used when forwarding audit data to an external SIEM.

### Custom retention policies

Some organizations have regulatory or internal requirements that call for shorter retention, longer retention, or scheduled destruction. Medplum can define a custom retention policy for your project. Contact [hello@medplum.com](mailto:hello@medplum.com) to discuss requirements.

## Testing

Restoring from backup is only a control if it is exercised. Medplum's policy requires testing the ability to restore from backup **at least annually**, and disaster recovery exercises are conducted on the same annual cadence. In practice restores are performed more often than the policy requires, as part of routine engineering and diagnostic work.

Backups are enabled for all hosted production projects. Evidence of the most recent test, along with the Business Continuity and Disaster Recovery policy and incident response tabletop results, is available through the [Medplum Trust Center](https://trust.medplum.com).

## Monitoring

Medplum continuously monitors the health and performance of the hosted platform, including database capacity and performance, CPU and memory utilization, storage consumption, request latency, and error rates. Automated alerts notify the engineering team when operational thresholds are exceeded or anomalous conditions are detected, and escalate through the incident response process as appropriate.

## Customer controls

Medplum's backups are for Medplum's recovery obligations. Customers who want an independent copy of their data, or their own retention regime, have several options.

**Deletion.** You choose between recoverable soft deletes and permanent [`$expunge`](/docs/api/fhir/operations/expunge). Both are available through the API without contacting support.

**Export.** All customer data is reachable through the FHIR API. For full extracts, use the [Bulk FHIR API](/docs/api/fhir/operations/bulk-fhir), which is the standard mechanism for exporting a complete data set. Medplum also supports continuous synchronization to a customer-managed data warehouse such as [Snowflake](/docs/analytics/snowflake) or [Redshift](/docs/analytics/redshift).

**Log streaming.** Logs can be streamed to a customer-managed system such as Splunk, Datadog, or Sumo Logic, so that log retention is governed by your policies rather than Medplum's. See [Monitoring](/docs/self-hosting/monitoring) and [Datadog](/docs/self-hosting/datadog).

**Custom retention.** Contact [hello@medplum.com](mailto:hello@medplum.com) to define a retention policy specific to your regulatory obligations.

## Requesting documentation

If your security or compliance team needs formal evidence rather than a summary, the following are available:

| Document                                         | Where                                             |
| ------------------------------------------------ | ------------------------------------------------- |
| SOC 2 Type II report                             | [Medplum Trust Center](https://trust.medplum.com) |
| Business Continuity and Disaster Recovery policy | [Medplum Trust Center](https://trust.medplum.com) |
| Backup restoration test evidence                 | [Medplum Trust Center](https://trust.medplum.com) |
| HITRUST e1 certification letter                  | [info@medplum.com](mailto:info@medplum.com)       |

See also [SOC 2 Type II](/docs/compliance/soc2), [HITRUST](/docs/compliance/hitrust), and [HIPAA Compliance](/docs/compliance/hipaa).
