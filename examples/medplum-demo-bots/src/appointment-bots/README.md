# Appointment Bots




### `appointment-send-scheduled-reminders.ts`

This bot is responsible for triggering appointment reminders that are scheduled to start in the next 24 hours. It runs on a schedule and:

1. Finds all appointments starting within the next 24 hours
2. Triggers the appointment reminder bot for each appointment(make sure you name the appointment reminder bot "appointment-reminder")
3. Logs success/failure for each reminder

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

### `appointment-reminder.ts`

This bot handles the actual sending of appointment reminders. It:

1. Sends reminders to both the patient
2. Includes appointment details in the reminder(Provider, Date, Time, Zoom link if available)

**Configuration:**
- You should fill in the message sending via SMS or email in the bot. By default it will log to the console.

**Example Usage for sending reminder not on a schedule:**
```typescript
// The bot will send reminders for a specific appointment
await medplum.executeBot('reminder-bot-id', appointment);
```