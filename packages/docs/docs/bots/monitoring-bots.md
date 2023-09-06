# Monitoring Bots

Bots allow for powerful functionality in your app, so it is very important to track what exactly each bot has done. This is possible using a bot's `AuditEvent` resources, which track each time the bot runs.

## Viewing a Bot's Events

To monitor your bots, navigate to the Bot resource page at https://app.medplum.com/Bot. This page will display all of the bots that are a part of your project.

Choose which bot's events you would like to view and click on it, bringing you to the bot resource page.

From this page, navigate to the `Event` tab. This tab will display all of the `AuditEvent` resources associated with the current bot. These events represent every time the bot has been run or triggered. This page display the outcomes from the bot, including anything that is printed to the console as part of the bot's functionality.

On the Event tab, there are four fields: ID, Outcome, Outcome Desc, and Last Updated. The Id field is the id of the `AuditEvent`, _not_ the bot.

The Outcome field represents the result of the event (i.e. success, failure, etc.), and is coded to four values.

| Code | Display         | Description                                                                                             |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `0`  | Success         | The bot ran successfully, though there may have been warnings.                                          |
| `4`  | Minor failure   | The bot was not able to complete due to a minor failure (often similar to an HTTP 400 response).        |
| `8`  | Serious Failure | The bot was not able to complete due to a more serious failure (often similar to an HTTP 500 response). |
| `12` | Major failure   | The bot failed with a major error and the system is no longer available for use.                        |

The Outcome Desc is a description of the results of the bot, including anything that was logged to the console by the bot.
