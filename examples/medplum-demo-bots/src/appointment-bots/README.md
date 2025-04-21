# Appointment Bots

### `send-appointment-reminders.ts`

This bot is responsible for triggering appointment reminders that are scheduled to start in the next 24 hours. It runs on a schedule and:

1. Finds all appointments starting within the next 24 hours
2. Compiles the pracitioner and patient details for each appointment and creates a reminder message
3. Creates a Communication resource for each reminder messafe with status 'in-progress'
4. Returns the appointments that were processed.

Note: You could create a bot that is subscribed to Communication resources that have a status of 'in-progress' and process the reminder via SMS or Email.


You could schedule this bot to run every day at 7:00AM to send reminders for appointments starting in the next 24 hours.
**Configuration:**
by adding a schedule to the bot.

ex in the Bot resource:
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
