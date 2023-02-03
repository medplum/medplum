---
sidebar_position: 2
toc_max_heading_level: 2
---

# Bots in Production

Editing bots in the web editor is good for getting started quickly, but as Bots become more important you will want to manage them as part of your regular software development lifecycle. This means:

- Storing bot code in source control (typically git)
- Writing unit tests for your bots
- Deploying your bots as part of your CI/CD pipeline.

## This Guide will show you

- How to set up a repository to host the source code for your Bots.
- Write a new `Bot` in Typescript.
- Create a new `Bot` resource and link it to your Typescript file.
- Use the [Medplum Command Line Interface (CLI)](https://github.com/medplum/medplum/tree/main/packages/cli) to deploy your Bot to production.

## Setting up your Repository

The first thing we'll do is set up a Git repository to host your Bot code. While you can set up bots in any git repository, we provide a [template Git repository](https://github.com/medplum/medplum-demo-bots) to help you get started.

Clone the repo and install the dependencies

```bash
git clone git@github.com:medplum/medplum-demo-bots.git my-bots
cd my-bots
npm install
```

## Create a source file

After we've installed dependencies, we can write your Bot in any typescript file under the `src/` directory.

As mentioned in [Bot Basics](./bot-basics), a bot is any Typescript file that contains a `handler` function with the following signature:

```ts
import { MedplumClient, BotEvent } from '@medplum/core';
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Your code here
}
```

See the [Bot Basics tutorial](./bot-basics#editing-a-bot) for more details about the arguments to `handler`.

The starter repository contains an example Bot in the `examples` directory called `hello-patient.ts`. You can copy this example file to get started on your own bots:

```bash
cd src
cp examples/hello-patient.ts my-first-bot.ts
```

You'll see that this creates a simple bot that logs the patient's name to the console. For more details on how this code works, check out the [Bot Basics](./bot-basics/#editing-a-bot) tutorial.

```ts
// src/my-first-bot.ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const firstName = patient.name?.[0]?.given?.[0];
  const lastName = patient.name?.[0]?.family;
  console.log(`Hello ${firstName} ${lastName}!`);
  return true;
}
```

## Compiling your Bot

Congratulations! You’ve just written your first bot. Our next step will be to compile this code and link it to a [`Bot` resource](/docs/api/fhir/medplum/bot).

First, compile your code:

```bash
npm run build
```

This runs the `tsc` compiler to translate your Typescript code to Javascript.

Next, take a look at your `dist/` directory and notice how there is now a file called `my-first-bot.js` with the compiled version of your code.

```bash
cd ..
ls dist

# my-first-bot.d.ts
# my-first-bot.js
# my-first-bot.js.map
# examples/
# ...

```

## Linking your code to a Bot Resource

The next step will be to create a [`Bot` resource](/docs/api/fhir/medplum/bot) using the Medplum App and link your code to the resource.

First, we'll have to create the resource in the Medplum App. If you haven't already done so, follow the instructions on the [Bot Basics tutorial](./bot-basics/#creating-a-bot) to create a new Bot resource.

Next, we need to tell the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli) which `.ts` and `.js` files are associated with the resource by editing the `medplum.config.json` field.

Open the the file `medplum.config.json` and add the following entry to the `bots` array.

```js
{
  "bots": [
    //…
    {
      "name": "my-first-bot",
      "id": "<BOT_ID>",
      "source": "src/my-first-bot.ts",
      "dist": "dist/my-first-bot.js"
    }
  ]
}
```

| Parameter | Description                                                                                                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | Name of the bot used in the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli) (below). **Note**: This name can be whatever your want. It does not have to match the filename of the bot code, nor anything in the Medplum App |
| `id`      | The Bot Resource `id`. Can be found by navigating to [app.medplum.com/Bot](https://app.medplum.com/Bot) and clicking on the entry for the corresponding Bot. See the [Bot Basics tutorial](./bot-basics#bot_id) for more information                 |
| `source`  | This is the location of the typescript source file for your bot. **Note**: Currently, Medplum only supports single-file Bots.                                                                                                                        |
| `dist`    | This is the location of the transpiled javascript file for your bot. For most setups, this will be in your `dist` directory of your package.                                                                                                         |

## Setting up your Permissions

Because Bots contain important or sensitive code, it's important to prevent unauthorized users from modifying your Bots. Medplum uses the [client credentials workflow](../auth/client-credentials) authenticate the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli).

First, you should create a Client Application on the Medplum Server by following [these directions](/docs/auth/client-credentials).

The [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli) looks for two environment variables when authenticating: `MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET`.

You can set these on the command line using the `export` command in bash.

```bash
export MEDPLUM_CLIENT_ID=<YOUR_CLIENT_ID>
export MEDPLUM_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
```

Alternatively, you can create a `.env` file to avoid having to re-export the environment variables in every new terminal. The example repository has a `.env.example` file you can copy to get started.

```bash
cp .env.example .env
```

```bash
# .env
MEDPLUM_CLIENT_ID=<YOUR_CLIENT_ID>
MEDPLUM_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
```

:::danger Warning

**Your `.env` file should _never_ be checked into source control.**

`MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET` should be considered sensitive security credentials and should never be shared in a publicly accessible store. The `medplum-demo-bots` repository adds `.env` to `.gitignore` by default.

:::

If you are self-hosting Medplum, set `MEDPLUM_BASE_URL` to the base URL of your Medplum server as an environment variable or in your .env file.

```bash
export MEDPLUM_BASE_URL=https://api.example.com/
```

```bash
# .env
MEDPLUM_BASE_URL=https://api.example.com/
```

## Deploying your Bot

Now that your Bot is written and compiled, the [resource](/docs/api/fhir/medplum/bot) is created, and your credentials are set, we can finally deploy our Bot to production using the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli).

To deploy our bot, we will use the `deploy-bot` command.

```bash
npx medplum deploy-bot <bot-name>
```

Where `<bot-name>` is the `name` property that you set for your bot in `medplum.config.json`. In our example, this would be:

```bash
npx medplum deploy-bot my-first-bot
```

Running this command does two things:

1. Save the Typescript source to the `code` property of your [`Bot` resource](/docs/api/fhir/medplum/bot)
2. Deploys your compiled Javascript code as an AWS Lambda function with your Medplum deployment.

:::caution Note
There is a known timing issue with the `deploy-bot` command. If you see the following error, try running the command again. If it fails after 3 tries, please [**submit a bug report**](https://github.com/medplum/medplum/issues/new) or [**contact us on Discord**](https://discord.gg/UBAWwvrVeN)

```
Deploy error: {
resourceType: 'OperationOutcome',
issue: [ { severity: 'error', code: 'invalid', details: [Object] } ]
}
```

:::

## Deploying to Staging vs. Production

A common usage pattern is to set up two Medplum Projects for an application: A `staging` project for development and integration testing, and a `production` project to power workflows.

The same Bot source code can be deployed to multiple Medplum projects by creating two separate entries in `medplum.config.json` with different names, pointing to the same source/compiled files.

```js
{
  "bots": [
    //…
    {
      "name": "my-first-bot-staging",
      "id": "<STAGING_BOT_ID>",
      "source": "src/my-first-bot.ts",
      "dist": "dist/my-first-bot.js"
    },
    {
      "name": "my-first-bot-production",
      "id": "<PRODUCTION_BOT_ID>",
      "source": "src/my-first-bot.ts",
      "dist": "dist/my-first-bot.js"
    }
    //...
  ]
}
```

To deploy the latest Bot to staging:

```bash
export MEDPLUM_CLIENT_ID=<STAGING_CLIENT_ID>
export MEDPLUM_CLIENT_SECRET=<STAGING_CLIENT_SECRET>
npm run build
npx medplum deploy-bot my-first-bot-staging
```

To deploy the latest Bot to production:

```bash
export MEDPLUM_CLIENT_ID=<PRODUCTION_CLIENT_ID>
export MEDPLUM_CLIENT_SECRET=<PRODUCTION_CLIENT_SECRET>
npm run build
npx medplum deploy-bot my-first-bot-production
```

This pattern is especially powerful when deploying Bots **as part of a CI pipeline**.

## Conclusion

As your Bots become more complex, integrating them into your software development workflow becomes crucial. Using the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli) allows you do integrate Bots into your regular code review process and deploy as part of your CI/CD pipelines.
