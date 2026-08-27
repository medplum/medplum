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
surfaces as an error on the request rather than as a job that silently never fires. Authoring a
`Cron` is a project-administrator capability, since it chooses the identity the Bot runs as.
