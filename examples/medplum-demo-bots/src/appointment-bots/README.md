# Appointment Bots

### `send-appointment-reminders.ts`

This bot is responsible for triggering appointment reminders that are scheduled to start in the next 24 hours. It runs on a schedule and:

1. Finds all appointments starting within the next 24 hours
2. Compiles the practitioner and patient details for each appointment and creates a reminder message
3. Creates a Communication resource for each reminder message with status 'in-progress'
4. Returns the appointments that were processed.

Note: This Bot just creates Communication resources with the messages to be sent. You could create a bot that is subscribed to Communication resources that have a status of 'in-progress' and process the reminder via SMS or Email, or you could edit the sendAppointmentReminder() function to handle your message sending.

You could schedule this bot to run every day at at a specific time to send reminders for appointments starting in the next 24 hours(or any other time interval).

**Configuration:**
You can do this by adding a schedule to the bot. See [Cron jobs for Bots](https://www.medplum.com/docs/bots/bot-cron-job) for more information. Remember, cron jobs must be turned on in your Medplum project for this to work.

example cronTiming on the Bot resource that runs every day at 7:00AM:

```json
"cronTiming": {
    "repeat": {
      "period": 1,
      "periodUnit": "d"
    },
    "event": [
      "2025-04-11T07:00:00.000Z"
    ]
  }
```
