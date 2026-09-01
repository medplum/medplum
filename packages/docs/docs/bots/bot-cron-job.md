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

In the Edit Form, scroll down to the Cron and choose one of the two ways to create a cron job. One as a UI tool, or a direct Cron format `e.g * */3 * * *`.

![Edit Form Page](/img/tutorials/edit-form.png)

Click Ok in the bottom of the page, and your bot will be added to the queue.

## Scheduling with the Cron resource

A [`Cron`](/docs/api/fhir/medplum/cron) resource owns a schedule independently of the Bot, so the
same Bot can run on several schedules, each under a different identity and with different input.
Requires the `cron` project feature.

| Element           | Meaning                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `active`          | Only an active job is scheduled. Setting it to false unregisters the job but keeps the schedule. |
| `onBehalfOf`      | The `ProjectMembership` whose identity and access policy the run assumes.                        |
| `targetReference` | The Bot to execute.                                                                              |
| `cronString`      | The schedule, as a five-field cron expression. Required.                                         |
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

- The `Cron` and its `onBehalfOf` `ProjectMembership` live in the customer project, which needs the
  `cron` feature. `onBehalfOf` can never name a membership in another project, linked or not — it
  chooses the access policy the run assumes, so allowing it would let one project borrow another's
  privileges.
- The Bot lives in the shared project, which needs the `bots` feature, and the customer project must
  link to it. If the shared project sets `exportedResourceType`, it has to include `Bot`.
- The customer project still needs a `ProjectMembership` of its own for that Bot to point
  `onBehalfOf` at.

The Bot therefore runs with the customer project's access policy, reading and writing the customer's
data, and its secrets are the shared project's overlaid with the customer's. The execution
`AuditEvent` is written to the customer project, since that is the identity the run assumed; the
publishing project sees its Bots' outcomes through server logs and bot execution metrics instead.

Revoking the link stops the job: the next tick unregisters it rather than failing indefinitely.
