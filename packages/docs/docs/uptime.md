---
sidebar_position: 3
---

# Uptime, Availability, and SLAs

There are two separate questions about uptime. The first is what Medplum commits to in a contract. The second is what Medplum has actually delivered in production. These are different things, and this page covers them separately.

Medplum commits to 99.99% uptime in its service level agreement (SLA). In production, Medplum has historically operated above that level.

## Availability percentages

Availability is usually expressed as a percentage. The table below shows the time allowed at each level.

| Availability         | Per year          | Per 30-day month  |
| -------------------- | ----------------- | ----------------- |
| 99.9% (three nines)  | about 8.8 hours   | about 43 minutes  |
| 99.99% (four nines)  | about 53 minutes  | about 4.3 minutes |
| 99.999% (five nines) | about 5.3 minutes | about 26 seconds  |
| 99.9999% (six nines) | about 32 seconds  | about 2.6 seconds |

The amount of allowed downtime depends on the measurement period. At 99.99%, the service can be unavailable for about 53 minutes per year, or about 4 minutes per 30-day month. SLAs are usually measured per month.

## What Medplum commits to

Medplum offers a 99.99% uptime SLA for the production hosted platform. The SLA is measured per month. It covers authentication, the FHIR API, subscriptions and webhooks, WebSocket connections, and Bot execution. If uptime falls below 99.99% in a month, the customer receives service credits as described in the agreement. Medplum sets the SLA at a level it can sustain under normal and adverse conditions.

:::warning[IMPORTANT]

The exact percentages, measurement methods, credit amounts, and exclusions are defined in the customer agreement. This page is documentation, not a contract or legal advice.

:::

## How Medplum achieves high availability

The platform is designed so that no component requires downtime to operate, scale, or upgrade.

The platform runs across multiple AWS Availability Zones. If one zone fails, the service continues to run in the others. This is the default configuration, so customers do not need to set anything up to get it.

Compute runs on Amazon ECS. ECS detects unhealthy hosts and replaces them automatically. Load balancers are configured for fast failover. The platform retries failed requests automatically where appropriate. Deployments do not require downtime. This includes major-version upgrades of the primary database, which run without a maintenance window.

## Historical performance

This section describes measured performance. It is not a guarantee and is not part of any contract.

Medplum has historically operated between five and six nines of availability in production. Downtime in a given period has ranged from zero to a few minutes.

Past performance does not predict future performance. Medplum publishes these figures so customers can compare actual results against the contractual commitment.

## What counts as downtime

Availability is the percentage of minutes in a measurement period during which the service can accept and respond to valid requests. The exact formula and the definition of a qualifying outage are set in the customer agreement.

The following are generally not counted as downtime, subject to the agreement:

- Problems caused by customer configuration, customer code, or customer networks.
- Failures of third-party systems outside Medplum's control.
- Force majeure events.

Self-hosted deployments run on customer infrastructure. They are not covered by the hosted SLA.

## Status and incidents

Medplum publishes a [status page](https://status.medplum.com) with real-time information about uptime, performance, and incidents. The status page includes historical uptime data and a record of past incidents, including root cause analyses and remediation steps.

You can also monitor uptime through third-party services that check the availability of the Medplum API endpoints. Some of these services include:

- [Pingdom](https://secure-stats.pingdom.com/o27bf8xq5197)
- [StatusCake](https://uptime.statuscake.com/?TestID=0fsJdxvnII)

Enterprise customers with shared Slack channels receive real-time notifications of incidents and maintenance events. Customers can also subscribe to email notifications for the status page.
