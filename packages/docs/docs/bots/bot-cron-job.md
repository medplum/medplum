---
sidebar_position: 21
---

# Cron Jobs for Bots

You can add a cron job for your bot so it can automatically run from a schedule. This means you can set a repeatable time for the bot to automatically every minute, day, other month, etc.

## To add a scheduled timer for your Bot

- Navigate to your [Bots Page](https://app.medplum.com/admin/bots)
- Click on the Bot you would like create a Cron Job for
- Click on the name of the Bot
  - When you click on the Bot's name and open up the page, you should see the url similar to this `https://app.medplum.com/Bot/<botId>`
- Click on the Edit Tab ![Edit Tab](/img/tutorials/edit-bot-page.png)

## The Edit Form

In the Edit Form, scroll down to the Cron and choose one of the two ways to create a cron job. One as a UI tool, or a direct [cron expression](#cron-expression-syntax) `e.g * */3 * * *`.

![Edit Form Page](/img/tutorials/edit-form.png)

Click Ok in the bottom of the page, and your bot will be added to the queue.

## Cron expression syntax

Medplum schedules jobs with [BullMQ](https://docs.bullmq.io/guide/job-schedulers/repeat-strategies),
which parses schedules with [cron-parser](https://github.com/harrisiirak/cron-parser), and validates
`cronString` with the same rules, except that seconds are not supported. An expression has five
fields:

```text
┌─────────── minute (0-59)
│ ┌───────── hour (0-23)
│ │ ┌─────── day of month (1-31, L)
│ │ │ ┌───── month (1-12, JAN-DEC)
│ │ │ │ ┌─── day of week (0-7, SUN-SAT, 0 and 7 are Sunday, L, #)
│ │ │ │ │
* * * * *
```

| Syntax                | Meaning                                     | Example                        |
| --------------------- | ------------------------------------------- | ------------------------------ |
| `*` or `?`            | Every value                                 | `0 * * * *`: every hour        |
| `a,b`                 | A list of values                            | `0 9,17 * * *`: 9:00 and 17:00 |
| `a-b`                 | A range of values                           | `0 9 * * MON-FRI`: weekdays    |
| `*/n`, `a/n`, `a-b/n` | Every `n`th value, from `a` or within `a-b` | `*/15 * * * *`: every 15 min   |
| `L` (day of month)    | The last day of the month                   | `0 0 L * *`                    |
| `nL` (day of week)    | The last given weekday of the month         | `0 0 * * 5L`: last Friday      |
| `n#k` (day of week)   | The `k`th given weekday of the month (1-5)  | `0 0 * * 1#2`: second Monday   |

The shorthands `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@hourly`, `@minutely`,
`@weekdays`, and `@weekends` are also accepted.

:::note Minute granularity only

Medplum does not run cron jobs more than once a minute. Unlike cron-parser, it rejects the optional
sixth (seconds) field, such as `*/10 * * * * *`, and the `@secondly` shorthand.

:::

An expression that can never fire is invalid, such as `0 0 31 2 *` (February 31st), as is one with an
out-of-range value, an inverted range such as `10-2`, or a value listed twice (including `0,7` for
Sunday). A `Cron` with an invalid `cronString` is always rejected on write. A `Bot` with an invalid
`cronString` is rejected in projects with [`strictMode`](/docs/api/fhir/medplum/project) enabled, the
default.

The same check is available in FHIRPath as `isValidCron()`, a Medplum extension that returns true
when its input string is a valid cron expression, e.g. `Bot.cron.ofType(string).isValidCron()`.

## Scheduling with the Cron resource

A [`Cron`](/docs/api/fhir/medplum/cron) resource owns a schedule independently of the Bot, so the
same Bot can run on several schedules, each under a different identity and with different input.
Requires the `cron` project feature.

| Element           | Meaning                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `active`          | Only an active job is scheduled. Setting it to false unregisters the job but keeps the schedule. |
| `onBehalfOf`      | The `ProjectMembership` whose identity and access policy the run assumes.                        |
| `targetReference` | The Bot to execute.                                                                              |
| `cronString`      | The schedule, as a [cron expression](#cron-expression-syntax). Required.                         |
| `endTime`         | The point after which the job stops running.                                                     |
| `parameter`       | Input for the Bot, which always receives the whole `Cron` resource, parameters included.         |

```json
{
  "resourceType": "Cron",
  "active": true,
  "cronString": "0 */3 * * *",
  "endTime": "2026-01-01T00:00:00.000Z",
  "onBehalfOf": { "reference": "ProjectMembership/<membershipId>" },
  "targetReference": { "reference": "Bot/<botId>" },
  "parameter": [{ "name": "region", "valueString": "us-east" }]
}
```

Writing a `Cron` whose `cronString` is not a valid cron expression is rejected, so a broken schedule
surfaces as an error on the request rather than as a job that silently never fires. The same applies
to `targetReference` and `onBehalfOf`: a reference the author cannot read is rejected on write,
rather than becoming a job that fails on every tick. Authoring a `Cron` is a project-administrator
capability, since it chooses the identity the Bot runs as.

### Running a Bot from a linked project

A Bot is code, not authority, so `targetReference` may name a Bot in a
[linked project](/docs/access/projects#project-linking) while `onBehalfOf` may not. That is what
lets a shared project publish a Bot once and each customer project schedule it:

- The `Cron` and its `onBehalfOf` `ProjectMembership` live in the customer project, which needs both
  the `cron` and `bots` features. `onBehalfOf` can never name a membership in another project,
  linked or not — it chooses the access policy the run assumes, so allowing it would let one project
  borrow another's privileges.
- The Bot lives in the shared project, which the customer project must link to. If the shared
  project sets `exportedResourceType`, it has to include `Bot`. The shared project does not itself
  need the `bots` feature to publish a Bot others run — that feature is checked against
  `onBehalfOf`'s project, since that is where the run executes — but it does need it to deploy one.
- The customer project still needs a `ProjectMembership` of its own for that Bot to point
  `onBehalfOf` at.

The Bot therefore runs with the customer project's access policy, reading and writing the customer's
data, and its secrets are the shared project's overlaid with the customer's. The execution
`AuditEvent` and the recorded Bot input both belong to the customer project — that is the identity
the run assumed, and the input is the customer's data — so the publishing project sees its Bots'
outcomes through server logs and bot execution metrics instead.

A job that can no longer run stops itself on its next tick rather than failing indefinitely.
Revoking the link, deleting the target Bot, and deleting the `onBehalfOf` `ProjectMembership` each
unregister it. Removing the `cron` feature only pauses it, so restoring the feature resumes the
existing schedule.
