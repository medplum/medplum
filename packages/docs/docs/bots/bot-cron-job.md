---
sidebar_position: 21
---

# Cron Jobs for Bots (Beta)

You can now add a cron job for your bot so it can automatically run from a schedule. This means you can set a repeatable time for the bot to automatically every minute, day, other month, etc.

## To add a scheduled timer for your Bot

- Navigate to your [Bots Page](https://app.medplum.com/admin/bots)
- Click on the Bot you would like create a Cron Job for
- Click on the name of the Bot
  - When you click on the Bot's name and open up the page, you should see the url similar to this `https://app.medplum.com/Bot/<botId>`
- Click on the Edit Tab ![Edit Tab](/img/tutorials/edit-bot-page.png)

## The Edit Form

In the Edit Form, scroll down to the Cron and choose one of the two ways to create a cron job. One as a UI tool, or a direct Cron format `e.g * */3 * * *`

![Edit Form Page](/img/tutorials/edit-form.png)

Click Ok in the bottom of the page, and your bot will be added to the queue.
