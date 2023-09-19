# Monitoring Bots

Bots allow for powerful functionality in your app, so it is very important to track what exactly each bot has done. This is possible using a bot's `AuditEvent` resources, which track:

- Each time the Bot runs
- The outcome of the run
- Any logs output by the run

## Viewing a Bot's Events

To monitor your bots, navigate to the Bot resource page at https://app.medplum.com/Bot. This page will display all of the bots that are a part of your project. Choose which bot's events you would like to view and click on it or, if you know the bot's `id`, navigate directly to https://app.medplum.com/Bot/:id. This will bring you to the Bot's individual resource page.

From this page, navigate to the `Event` tab, or https://app.medplum.com/Bot/:id/event. This tab will display all of the `AuditEvent` resources associated with the current bot. These events represent every time the bot has been triggered. This page displays the outcomes from the bot being run, including anything that is printed to the console as part of the bot's functionality.

On the Event tab, there are four fields: ID, Outcome, Outcome Desc, and Last Updated. 

| Field          | Description                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ID`           | The id of the `AuditEvent` being displayed, _not_ the bot's id.                                                         |
| `Outcome`      | The result of the event (i.e. success, failure, etc.). There are four possible values. See the table below for details. |
| `Outcome Desc` | A description of the results of the bot, including anything that was logged to the console by the bot.                  |
| `Last Updated` | The last time the `AuditEvent` was updated. This is likely when the bot finished running.                               |

The Outcome field represents the result of the event (i.e. success, failure, etc.), and is coded to four values.

| Code | Display         | Description                                                                                             |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `0`  | Success         | The bot ran successfully, though there may have been warnings.                                          |
| `4`  | Minor failure   | The bot was not able to complete due to a minor failure (often similar to an HTTP 400 response).        |
| `8`  | Serious Failure | The bot was not able to complete due to a more serious failure (often similar to an HTTP 500 response). |
| `12` | Major failure   | The bot failed with a major error and the system is no longer available for use.                        |

The Outcome Desc is a description of the results of the bot, including anything that was logged to the console by the bot.

## Troubleshooting

### Audit Events Missing

It is possible that on the `Event` tab, there will not be any `AuditEvent` resources stored in the database. This is likely because the bot is configured to only write to the logs, which allows for large-scale bot execution. 

To ensure that your bot is writing to your app, you can configure your bot using the `Bot.auditEventDestination` field. Setting this field to `resource` will update it so that all events executed by your bot appear in your console. For more details see the [Configuring Bot Logging docs](/docs/bots/bots-in-production#configuring-bot-logging).
