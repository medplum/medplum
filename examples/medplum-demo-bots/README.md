# Medplum Demo Bots

This repo contains code for [Medplum Bots](https://docs.medplum.com/app/bots). Bots power many of the integrations you see in Medplum apps. You can view your deployed bots online on the [Medplum App](https://app.medplum.com).

Bots make heavy use of the [Medplum JS Client Library](https://docs.medplum.com/typedoc/core/index.html).

## Setup

To set up your bot deployment you will need to do the following:

- [Create a Bot](https://app.medplum.com/admin/project) on Medplum and note its `id`. (All Bots in your account can be found [here](https://app.medplum.com/Bot))
- Create a new typescript file (e.g. `my-bot.ts`) and copy the contents of `examples/hello-patient.ts` into your new file.
- With the `id` of the Bot `id` in hand, add a section to `medplum.config.json` like so

```json
{
  "name": "sample-account-setup",
  "id": "aa3a0383-a97b-4172-b65d-430f6241646f",
  "source": "src/examples/sample-account-setup.ts",
  "dist": "dist/sample-account-setup.js"
}
```

- [Create a ClientApplication](https://app.medplum.com/ClientApplication/new) on Medplum. (All ClientApplications in your account can be found [here](https://app.medplum.com/ClientApplication))
- Create a .env file locally by copying `.env.example` and putting the `ClientId` and `ClientSecret` from the `ClientApplication` into the file.
- (Optional) Create an [AccessPolicy](<(https://app.medplum.com/AccessPolicy)>) on Medplum that can only read/write Bots and add it to the Bot in the [admin panel](https://app.medplum.com/admin/project).

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
npx medplum deploy-bot sample-account-setup
```

You will see the following in your command prompt if all goes well:

```bash
Update bot code.....
Success! New bot version: 7fcbc375-4192-471c-b874-b3f0d4676226
Deploying bot...
Deploy result: All OK
```
