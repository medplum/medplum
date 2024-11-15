---
slug: zero-downtime-postgres-major-version-upgrade
title: Achieving a zero-downtime Postgres major version upgrade
authors: mattlong
tags: [self-host, fhir-datastore]
---

Medplum is built on Postgres. Until recently, our hosted Medplum service was using an Amazon Web Services (AWS) RDS Aurora Postgres cluster running version 12.16. Since v12 is rather outdated and nearing the end of its standard support window on RDS, it was time to plan our upgrade to the newest version available on RDS, v16.4. Various methods to upgrade to a new major version on various places across the downtime vs level-of-effort continuum; we decided to upgrade our database with no downtime. This is how we did it.

<!-- truncate -->

The upgrade methods we evaluated:

- **RDS in-place major version upgrade** - Update the cluster’s version through the web console, AWS CLI, etc., choose “Apply immediately”, and wait for the cluster to undergo the Postgres major version upgrade process.
- **RDS Blue/Green Deployments** - A managed workflow provided by RDS for testing database configuration changes before implementing them in production, such as upgrading the major database version.
- **Self-managed blue/green deployment** - A workflow similar in spirit to the one provided by an RDS-managed Blue/Green deployment mentioned above, but one that is fully managed by us.

### RDS in-place major version upgrade

This is perhaps the lowest-effort way to upgrade to a new major version of Postgres if you can tolerate **20-30+ minutes of downtime**. With just a handful of mouse clicks in the AWS web console, you can sit back and wait for your database to update itself. We did not seriously consider this option since that much downtime was not acceptable.

### RDS Blue/Green Deployment

With just a little more effort than upgrading your cluster in place, using an RDS Blue/Green deployment will typically result in **less than one minute of downtime**, “but it can be longer depending on your workload”.

Some background. A [blue/green deployment](https://en.wikipedia.org/wiki/Blue%E2%80%93green_deployment) is a tried and true method for rolling out changes to a service. From the RDS docs:

> In a blue/green deployment, the *blue environment* is the current production environment. The *green environment* is the staging environment. The staging environment stays in sync with the current production environment using logical replication…

…When ready, you can switch over the environments to transition the green environment to be the new production environment. The switchover typically takes under a minute with no data loss and no need for application changes.

>

The RDS team provides ample documentation on their [managed Blue/Green Deployments](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-overview.html) and how they can be [used for major version upgrades](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments.html) in particular. There are a number of limitations and restrictions for Blue/Green Deployments; [some specific to RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-considerations.html#blue-green-deployments-limitations-general) and [some applicable to any workflow that built around Postgres logical replication](https://www.postgresql.org/docs/current/logical-replication-restrictions.html).

When testing an RDS Blue/Green Deployment on a staging environment, we consistently observed that the database cluster was disconnected and unavailable to our app servers for at least 30 seconds and sometimes longer during the switchover from blue to green.

### Self-managed Blue/Green deployment

While 30 seconds of downtime is clearly a huge improvement over the 20+ minutes from an in-place version upgrade, but we wanted to drop that number even lower even if it meant investing more time and effort. Why? In addition to making this particular database version upgrade as seamless and unnoticeable as possible for our customers, we always want to improve our familiarity with and ability to administer and manage Postgres since it is such an foundational part of the Medplum service.

To achieve this, we went about designing a plan to manually manage a blue/green deployment and switchover to facilitate our major version upgrade that would both minimize database downtime and avoid database clients from disconnecting during the switchover; thus eliminating the need for our servers to be aware that the switchover was happening. Our plan was built around three major components:

1. Using Postgres logical replication to create a green database cluster continuously kept in sync with the blue production database cluster.
2. Using PgBouncer as a proxy/connection pooler to facilitate the switchover and avoid any dropped database client connections
3. A switchover script to orchestrate the switchover as fast as possible

To cut to the chase, **here is the [step-by-step postgres upgrade runbook](https://github.com/medplum/medplum-postgres-upgrade/blob/main/docs/runbook.md) we used to manage our database upgrade** and its [supporting resources](https://github.com/medplum/medplum-postgres-upgrade). Let’s walk through some steps of the runbook to provide some more color.

### Enabling logical replication in RDS Aurora cluster parameter group

A prerequisite for using Postgres logical replication on an RDS cluster is setting `rds.logical_replication` to `1`. The values we used for the other `max_*` settings were pulled from other guides and write ups we studied. They may need adjusting based on the instance type or your cluster instances.

Here are all the parameters we set/updated:

```json
{
  "rds.logical_replication": "1",
  "max_replication_slots": "25",
  "max_wal_senders": "25",
  "max_logical_replication_workers": "25",
  "max_worker_processes": "50"
}
```

Note that `rds.logical_replication` is a **static** parameter meaning the database must be rebooted for the change to take effect. The reboot generally takes around **5-10 seconds during which time your database will be unavailable and drop connections**. As such, you should ideally schedule this reboot should during a maintenance window and/or when traffic to your database is at a minimum. An improvement for next time we go through this process could be to utilize PgBouncer as a proxy (discussed below) to `PAUSE` and `RESUME` the database around the reboot to substitute dropped connections for increased query time since client queries are held at the proxy until the database is resumed.

### Provisioning a PgBouncer server

PgBouncer is a powerful tool with a lot of use cases and tons of configuration settings. Since configuration is mostly file-based and is only going to be in our stack temporarily to facilitate the upgrade, we chose to set it up as a one-off EC2 server to simplify things. Since PgBouncer would only be getting used for around an hour, we decided introducing it as single-point-of-failure (SPOF) was acceptable.

Why didn’t we keep PgBouncer in our stack permanently? We prefer to keep our stack as simple as possible to avoid the overhead of managing another service. Furthermore, making PgBouncer into a highly available (HA) service is non-trivial.

A few things to call our from our [PgBouncer setup guide](https://github.com/medplum/medplum-postgres-upgrade/blob/main/docs/pgbouncer-setup.md):

PgBouncer has pretty low CPU and memory requirements for the way we use it, but we wanted to get as much network bandwidth without totally breaking the bank to avoid introducing a network bandwidth bottleneck to/from our database. As such, we provisioned our PgBouncer instance on an `m5.2xlarge` instance which was likely overkill.

Make sure to put the server in the same VPC as your RDS cluster and application servers. To minimize network lag, we put PgBouncer in the same availability zone (AZ) as our cluster’s writer instance.

### Provisioning a jumpbox

This is another EC2 server that you’ll SSH onto in order to perform various steps (most notably, execute the switchover script). It needs SSH access to your PgBouncer server as well as Postgres access (port 5432) to PgBouncer as well as your blue and green database clusters.

There isn’t too much else to discuss from our [jumpbox setup guide](https://github.com/medplum/medplum-postgres-upgrade/blob/main/docs/jumpbox-setup.md) besides commiserating that it can be a bit tedious to get all the security group rules setup correctly to allow SSH and Postgres access. The telltale that you haven’t configured your security groups quite right yet is an `ssh` or `psql` command hanging indefinitely.

Throughout our runbook, unless otherwise noted, all SQL queries and other commands you run should be performed from the jumpbox. Why? The last thing you want is a network hiccup between your laptop/desktop and the AWS datacenter to halt the switchover script at just the wrong time. Along those lines, we highly recommend you use tmux, screen, or some other terminal multiplexer on your jumpbox to further avoid inflight scripts from being interrupted.

### Setting up logical replication

[Postgres logical replication](https://www.postgresql.org/docs/current/logical-replication.html) streams logical changes to a database from one Postgres server to others by utilizing the write-ahead log (WAL).

There are several [limitations](https://www.postgresql.org/docs/current/logical-replication-restrictions.html) to the types of changes that can be logically replicated. A few of these limitations are relevant to Medplum: database schema/DDL changes, Sequence data, and replica identities. Avoiding schema/DDL changes was just a people coordination problem; we barred anyone from deploying server changes that included database migrations during the time in which logical replication was in use; roughly 24 hours. For sequences, the next value of each sequence is synchronized as part of our switchover script as discussed below. Finally, each table to be logically replicated must have either a primary key or a [replica identity](https://www.postgresql.org/docs/current/sql-altertable.html#SQL-ALTERTABLE-REPLICA-IDENTITY). Medplum actually has a decent number of tables without primary keys; it was appropriate to use `REPLICA IDENTITY FULL` for them all. Of course that is not universally true; some tables may require other replica identity options.

With `rds.logical_replication` enabled as discussed above, we begin to set up logical replication by creating a publication and replication slot on your live, production (i.e. blue) database. It is **critical that the replication slot is created before cloning your database**. Why? Logical replication can only march forward in time. More precisely, a replication slot references a log sequence number (LSN) in the WAL and can only advance forward to a more recent LSN; never backwards.

Once the replication slot is created, it is best to perform the next few steps of creating your green database, upgrading it to your desired new Postgres major version, and finally enabling logical replication to it all happen in a timely manner. There is no need to rush through these steps by any means, just don’t let the replication slot linger unused for hours and certainly not days. Why? A Postgres server must retain as much of its WAL as is necessary to service its oldest replication slot and when the WAL grows too large, this can potentially lead to issues. On Aurora, there is an asterisk on that last sentence since Aurora stores the WAL differently than a traditional Postgres server but generally speaking, the point still stands.

**Be sure to capture the initial LSN of the green database before upgrading it to the new Postgres version.** Why? The LSNs on a server’s WAL get reset during the process of performing a major version upgrade. There is no good way to recover from this should you forget; you’ll need to throw away the green database clone and create a new one.

**Under no circumstances should you skip running `ANALYZE VERBOSE` after upgrading your green database.** Why? Table statistics are lost during the major version upgrade process. Without those statistics, indexes generally will not be used by the query planner resulting in most queries resorting to a sequential scan.

### Preparing for the switchover

We generally employ at least one reader instance in our Aurora cluster to shed some load from our writer. To simplify our upgrade story, we temporarily stopped employing readers starting about an hour before performing the switchover and added them back shortly after confirming the switchover was complete and verified. Since our writer can still handle _all_ database traffic on its own even during the daily peak, taking them out of rotation during the low-traffic time we scheduled our switchover for wasn’t at all concerning for us. If reader availability is required throughout it, several parts of the upgrade process would have to be adjusted; including but not limited to using PgBouncer to also proxy reader traffic and adjusting the switchover script to pause and resume traffic to the reader endpoint in addition to the writer endpoint before and after the switch from blue to green.

As discussed above, we only used PgBouncer temporarily to facilitate our database upgrade. We started using PgBouncer about an hour before the switchover and stopped using it shortly after the switchover was complete and verified.

### Executing the switchover

Spoiler alert: the actual switchover process was quick and anti-climatic just like we were planning for. Of course, making it quick and anti-climatic took quite a bit of preparation and iteration. We automated the switchover process by writing [a custom script](https://github.com/medplum/medplum-postgres-upgrade/blob/main/src/switchover.ts). We erred on the side of making the script too verbose rather than not enough. While the script was written with the particulars of Medplum in mind, it should be straightforward to adapt it to other environments.

The first thing the switchover script does is run a number of precondition checks before it even considers executing the actual switchover. The checks include things like connectivity to the various databases, SSH access to the PgBouncer server, verifying PgBouncer configuration, verifying recent data is identical between the blue and green servers, logical replication lag is low enough, etc. The precondition check section is the time to be paranoid and verbose. Several of the checks included were added as a result of us forgetting to manually perform some earlier step or configuration change in one of our many test runs of the script.

If all preconditions have passed, the script then waits for user confirmation to proceed with the actual switchover. Why? To allow us to ensure that we weren’t in the middle of handling a sudden spike in traffic and didn’t have any long-running queries. This was fairly easy to ascertain thanks to a custom realtime [terminal-based dashboard](https://github.com/medplum/medplum-postgres-upgrade/blob/main/src/dashboard.ts) that displays active Postgres connections on the blue and green databases, PgBouncer configuration and traffic stats, and logical replication lag in near realtime.

Once we proceeded, the switchover script did the following in about one second:

- Pauses the medplum database on PgBouncer, an operation that blocks until all in-flight queries (to the blue database) have finished
- Waits fro replication lag to drop to zero bytes
- Synchronizes auto-incrementing sequence last values from blue to green
- Updates PgBouncer to proxy connections to green instead of blue
- Resumes the medplum database on PgBouncer, forwarding client connections held during the paused period to the green database

If something goes wrong during the switchover process, e.g. replication lag not dropping to zero in time, the script makes a best effort to revert back to the blue database.

To get a feel for the customer experience during the switchover, we ran a k6 script starting a couple minutes before the switchover that tries to create a resource on Medplum every 0.5 seconds. In the steady state before and after the switchover, each request took about 35 milliseconds on average. During the switchover, all we noticed was one request taking just over a second (1082ms), a result we were very happy with:

```
http_req_duration,1729645809,32.86
http_req_duration,1729645811,40.64
http_req_duration,1729645811,1082.12
http_req_duration,1729645811,35.78
http_req_duration,1729645812,33.79
```

### After the switch over

After sanity checking that our systems were still working as expected, one last important step that should be performed promptly is to drop the logical replication subscription on the green database. While we were confident there would be no more traffic sent to the blue database, it is of course best to shut off the pipe to properly treat the green database and the new source of truth that it is.

Next, we once altered all tables that we had previously altered to use `REPLICA IDENTITY FULL` back to `REPLICA IDENTITY DEFAULT` since we are longer be using logical replication. After that, there wasn’t anything else time-sensitive to do besides removing PgBouncer and starting to send traffic to readers once again in our new Aurora cluster. The next day we wrapped up the rest of the cleanup: deprovisioning the PgBouncer and jumpbox server, cleaning up security groups, etc.

### Wrapping up

We hope you find the guide useful! We wrote it not only to share with the community but to capture not only the “what” and “how” of a Postgres upgrade, but the “why” as well for the next time we find ourselves upgrading Postgres.

We’d love to hear any comments or feedback if you’ve done something like this before.
