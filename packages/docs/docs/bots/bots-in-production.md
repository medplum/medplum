---
sidebar_position: 2
toc_max_heading_level: 2
---

# Bots in Production

Editing bots in the web editor is good for getting started quickly, but as Bots become more important you will want to manage them as part of your regular software development lifecycle. This means:

- Storing bot code in source control (typically git)
- Writing unit tests for your bots
- Deploying your bots as part of your CI/CD pipeline.

:::note[Bots in Local Development]

If you want to run bots locally, you should use a VM Context. For more details see the [Running Bots Locally docs](/docs/bots/running-bots-locally).

:::

## This Guide will show you

- How to set up a repository to host the source code for your Bots.
- Write a new `Bot` in TypeScript.
- Create a new `Bot` resource and link it to your TypeScript file.
- Use the [Medplum Command Line Interface (CLI)](https://github.com/medplum/medplum/tree/main/packages/cli) to create and deploy your Bot to production.

## Setting up your Repository

The first thing we'll do is set up a Git repository to host your Bot code. While you can set up bots in any git repository, we provide a [template Git repository](https://github.com/medplum/medplum-demo-bots) to help you get started.

The Medplum Bot SDK requires [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Version 20+ is required.

Clone the repo and install the dependencies

```bash
git clone git@github.com:medplum/medplum-demo-bots.git my-bots
cd my-bots
npm install
```

## Setting up your Permissions

Because Bots contain important or sensitive code, it's important to prevent unauthorized users from modifying your Bots. Medplum uses the [client credentials workflow](/docs/auth/client-credentials) authenticate the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli).

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

:::danger[Warning]

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

## Create a source file

After we've installed dependencies, we can write your Bot in any typescript file under the `src/` directory.

As mentioned in [Bot Basics](./bot-basics), a bot is any TypeScript file that contains a `handler` function with the following signature:

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

First, build your code:

```bash
npm run build
```

:::note[Note]
In the [medplum-demo-bots](https://github.com/medplum/medplum-demo-bots) template, **`npm run build`** runs **`tsc`** and then an **esbuild** script. TypeScript produces typings and intermediate output; esbuild bundles each bot entry into the **JavaScript files** under `dist/` that you deploy. The path in `medplum.config.json` **`dist`** must point at that **deployable** artifact. Other repositories may use esbuild alone, Rollup, webpack, or another bundler, as long as the `dist` file is the code you want running in AWS Lambda.
:::

Next, take a look at your `dist/` directory and notice how there is now a file called `my-first-bot.js` with the bundled version of your code.

```bash
cd ..
ls dist

# my-first-bot.d.ts
# my-first-bot.js
# my-first-bot.js.map
# examples/
# ...

```

## Including npm dependencies

When you run `npx medplum bot deploy`, the CLI reads **one file**: the path configured as **`dist`** in `medplum.config.json` (typically a single `.js` file). It does **not** upload your `node_modules` directory or the entire `dist` folder tree - only the contents of that file are sent for Lambda deployment.

To use **npm packages** that are not on the Medplum bot Lambda layer, your build must **bundle** them into that file:

- Use a bundler with **`bundle: true`** (or equivalent). In the demo repo, see [`esbuild-script.mjs`](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/esbuild-script.mjs), which bundles each bot and lists **`external`** only for packages supplied by the layer (derived from [`@medplum/bot-layer`](https://github.com/medplum/medplum/blob/main/packages/bot-layer/package.json) **dependencies** in the main Medplum repository).
- Any package **not** marked `external` is included in the output. If you skip bundling and ship plain transpiled JS that still `require`s or `import`s a dependency that is neither on the layer nor in that single file, the bot **will fail at runtime** in Lambda.

**Typical workflow:** `npm install` → `npm run build` → `npx medplum bot deploy <bot-name>`. Use the same sequence in CI/CD before deploy.

### Limitations

- **Deployment size:** AWS Lambda enforces maximum deployment size for the function package and for the **combined unzipped** size of the function and all layers (currently **250 MB** total). Very large bundles can exceed these limits or slow cold starts.
- **Native code:** Packages that ship platform-specific binaries must be built for the **Lambda execution environment** (OS and CPU architecture). Pure JavaScript dependencies are the most straightforward.
- **Runtime:** Lambda bots use the **Node.js version** configured on the Medplum server (open-source defaults use a current AWS Lambda Node.js **22.x** runtime). Self-hosted deployments should match their build target to their server's bot runtime.
- **Bundler edge cases:** Dynamic `require()` with a **variable** path can be skipped by bundlers. Prefer static imports or explicit configuration.
- **Secrets:** Do not embed credentials in bundled source. Use [Bot secrets](/docs/bots/bot-secrets) or your deployment's recommended secret mechanism.

## Creating your Bot

Next step is to create the bot.

Navigate to the [Project Admin panel](https://app.medplum.com/admin/project) and copy the ID of your project. That will be your `project-id`.

Taking the `source-file` we just created at `src/my-first-bot.ts`, we will use the `bot create` command. In our example

```bash
npx medplum bot create <bot-name> <project-id> <source-file> <dist-file>
```

Running this command does the following:

1. Creates the Bot resource
2. Creates a ProjectMembership resource that connects it to a project
3. Saves the bot to the associated project in the Medplum database
4. Adds a bot entry to the `medplum.config.json` file in the `bots` array

:::caution[Note]
If you see an error, try running the command again. If it fails after 3 tries, please [**submit a bug report**](https://github.com/medplum/medplum/issues/new) or [**contact us on Discord**](https://discord.gg/medplum)
:::

After creating the bot, you should go to `medplum.config.json` and you should see the new bot added in the bottom of the file. It should look like this:

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
| `dist`    | This is the path to the **deployable** JavaScript file for your bot (usually **bundled** for AWS Lambda). For most setups, this will be in your `dist` directory.                                                                                    |

## Deploying your Bot

Now that your Bot is written and compiled, the [resource](/docs/api/fhir/medplum/bot) is created, and your credentials are set, we can finally deploy our Bot to production using the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli).

To deploy our bot, we will use the `bot deploy` command.

```bash
npx medplum bot deploy <bot-name>
```

Where `<bot-name>` is the `name` property that you set for your bot in `medplum.config.json`. In our example, this would be:

```bash
npx medplum bot deploy my-first-bot
```

Use a wild card \* in `<bot-name>` to deploy multiple bots matching the pattern.
This would allow us to deploy bots as part of a CI/CD pipeline, without having to update the command every time a new bot is added.

```bash
npx medplum bot deploy *staging*
```

Running this command does three things:

1. Saves the TypeScript source on your [`Bot` resource](/docs/api/fhir/medplum/bot) (attached as source code)
2. Deploys the JavaScript from your **`dist`** file as an AWS Lambda function with your Medplum deployment
3. Packages that file with Medplum's Lambda wrapper; at runtime the [Medplum bot Lambda layer](https://github.com/medplum/medplum/blob/main/packages/bot-layer/package.json) supplies the dependencies listed there (your bundler should usually mark those as `external`)

:::caution[Note]
There is a known timing issue with the `bot deploy` command. If you see the following error, try running the command again. If it fails after 3 tries, please [**submit a bug report**](https://github.com/medplum/medplum/issues/new) or [**contact us on Discord**](https://discord.gg/medplum)

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
npx medplum bot deploy my-first-bot-staging
```

To deploy the latest Bot to production:

```bash
export MEDPLUM_CLIENT_ID=<PRODUCTION_CLIENT_ID>
export MEDPLUM_CLIENT_SECRET=<PRODUCTION_CLIENT_SECRET>
npm run build
npx medplum bot deploy my-first-bot-production
```

This pattern is especially powerful when deploying Bots **as part of a CI pipeline**.

## Configuring Bot Logging

Bots can be run at a very high volume - for example as part of an ADT feed or when triggered by high-frequency messages. This can result in thousands of invocations per day, which can be overwhelming to track. In these cases, it may make sense to fine-tune the level of logging for your Bots.

There are two ways to control Bot logging in Medplum: the type of event logged (i.e., success, failure, etc.) and where the event gets logged to.

### Logging Triggers

You can choose to only log certain events using the `Bot.auditEventTrigger` field. This element represents the criteria for when an `AuditEvent` resource should be created and has four possible values.

| Trigger     | Description                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `always`    | An audit event is created and saved every time the bot runs. This is the default setting.      |
| `never`     | An audit event will never be saved by the bot.                                                 |
| `on-error`  | An audit event is created and saved only if the bot throws an error.                           |
| `on-output` | An audit event is created and saved whenever the bot logs any output as part of its execution. |

### Logging Destination

Logging can also be limited by setting the destination that your Bot logs to. This is done using the `Bot.auditEventDestination` field. This element can be set to either `resource` or `log`.

By default, `auditEventDestination` is set to `resource`. This will create an `AuditEvent` resource in the main database, which can be accessed by Medplum's API and will be visible in your app. However, the operation is slower and takes up more space. It is best practice to always start by using `resource` as it allows for easier testing and debugging of your Bot.

Setting `auditEventDestination` to `log` will only output an `AuditEvent` in your existing enterprise logging infrastructure, such as [AWS Athena](/docs/self-hosting/aws-athena-guide), [Datadog](/docs/self-hosting/datadog), or others. This can make testing and debugging more difficult, but is quicker and useful for high-volume operations as it will fill up or slow down your main database.

## Conclusion

As your Bots become more complex, integrating them into your software development workflow becomes crucial. Using the [Medplum CLI](https://github.com/medplum/medplum/tree/main/packages/cli) allows you do integrate Bots into your regular code review process and deploy as part of your CI/CD pipelines.
