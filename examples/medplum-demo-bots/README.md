# Medplum Demo Bots

This repo contains code for [Medplum Bots](https://www.medplum.com/docs/bots). Bots power many of the integrations you see in Medplum apps. You can view your deployed bots online on the [Medplum App](https://app.medplum.com).

Bots make heavy use of the [Medplum JS Client Library](https://www.medplum.com/docs/sdk/core).

## Available Bots

### Appointment Reminder Bot
Located in `examples/medplum-demo-bots/src/appointment-bots/send-appointment-reminders.ts`, this bot:
- Sends reminders for upcoming appointments
- Handles both 1-hour and 12-hour reminders in a single bot
- Creates Communications for each reminder
- Includes test coverage in `send-appointment-reminders.test.ts`

To deploy:
```bash
npx medplum bot deploy send-appointment-reminders
```

## Setup

To set up your bot deployment you will need to do the following:

- [Create a Bot](https://app.medplum.com/admin/project) on Medplum and note its `id`. (All Bots in your account can be found [here](https://app.medplum.com/Bot))
- Create a new typescript file (e.g. `my-bot.ts`) and copy the contents of `examples/medplum-demo-bots/src/appointment-bots/send-appointment-reminders.ts` into your new file.
- With the `id` of the Bot `id` in hand, add a section to `medplum.config.json` like so

```json
{
  "name": "send-appointment-reminders",
  "id": "your-bot-id-here",
  "source": "src/appointment-bots/send-appointment-reminders.ts",
  "dist": "dist/send-appointment-reminders.js"
}
```

- [Create a ClientApplication](https://app.medplum.com/ClientApplication/new) on Medplum. (All ClientApplications in your account can be found [here](https://app.medplum.com/ClientApplication))
- Create a .env file locally by copying `.env.example` and putting the `ClientId` and `ClientSecret` from the `ClientApplication` into the file.
- (Optional) Create an [AccessPolicy](<(https://app.medplum.com/AccessPolicy)>) on Medplum that can only read/write Bots and add it to the Bot in the [admin panel](https://app.medplum.com/admin/project).

Medplum bots can also be created, edited, and deployed entirely from the medplum app. See [creating a bot](https://www.medplum.com/docs/bots/bot-basics#creating-a-bot)

## Installation

To run and deploy your Bot do the following steps:

Install:

```bash
npm i
```

Build:

```bash
npm run build
```

Test:

```bash
npm t
```

Deploy one bot:

```bash
npx medplum bot deploy sample-account-setup
```

You will see the following in your command prompt if all goes well:

```bash
Update bot code.....
Success! New bot version: 7fcbc375-4192-471c-b874-b3f0d4676226
Deploying bot...
Deploy result: All OK
```
