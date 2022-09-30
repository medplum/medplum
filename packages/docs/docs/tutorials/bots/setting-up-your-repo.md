---
sidebar_position: 2
toc_max_heading_level: 2
---

# Setting up your Bot Development Repo

Editing bots in the web editor is good for getting started quickly, but as Bots become more important you will want to manage them as part of your regular software development process. This means:

- Storing bot code in source control
- Creating pull requests and code reviews for your bots
- Writing unit tests for your bots
- Setting up a CI/CD pipeline for your bots

In this tutorial, we'll walk through the process of setting up a repository to host the code for your Bots, and using the [Medplum CLI](#) to save and deploy your bots in production.

## Setting up your Repository

The first thing we'll do is set up a Git repository to host your Bot code. While you can set up bots in any git repository, we provide a [template Git repository](https://github.com/medplum/medplum-demo-bots) to help you get started.

```bash
git clone git@github.com:medplum/medplum-demo-bots.git my-bots
```

Next, install the dependencies

```bash
cd my-bots
npm ci
```

## Create a source file

After you've installed your dependencies, you can write your Bot in any typescript file under the `src/` directory.

A bot is any Typescript file that contains a `handler` function with the following signature:

```ts
import { MedplumClient, BotEvent } from '@medplum/core';
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Your code here
}
```

See the [Bot Basics](/tutorials/bots/bots-basics#editing-a-bot) for more details about the arguments to `handler`.

The starter repository contains an skeleton Bot file called `bot.ts.example` with the proper signature and imports. You can copy this example file to get started on your own bots:

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

## Linking your code to a Bot

The next step will be to create a [`Bot` resource](/docs/api/fhir/medplum/bot) using the Medplum App and link your code to the resource.

First, follow the instructions on the [Bot Basics tutorial](./bot-basics/#creating-a-bot) to create a new Bot resource.

Next, edit the file called `medplum.config.json` and add the following entry:

```json
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

The `medplum.config.json` file connects your source files, compiled javascript files, and Bot resources. It contains a single property, `bots`, which is an array of Bot configurations with the following properties.

| Parameter | Description                                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | Name of the bot used in the Medplum CLI (below). **Note**: This name can be whatever your want. It does not have to match the filename of the bot code, nor anything in the Medplum App                                      |
| `id`      | The Bot Resource `id`. Can be found by navigating to [app.medplum.com/Bot](app.medplum.com/Bot) and clicking on the entry for the corresponding Bot. See the [Bot Basics tutorial](./bot-basics#bot_id) for more information |
| `source`  | This is the location of the typescript source file for your bot. **Note**: Currently, Medplum only supports single-file Bots.                                                                                                |
| `dist`    | This is the location of the transpiled javascript file for your bot. For most setups, this will be in your `dist` directory.                                                                                                 |

## Setting up your Permissions

Before you can push your code into your Medplum instance, you can

/docs/tutorials/security/client-credentials

## Configure your Repository

Congratulations! You’ve just written your first bot. The next step is the take the code in your file, and deploy it to the Bot you created in the Medplum App.

First, compile you code:

```bash
npm run build
```

Next, take a look at your “dist/” directory. Notice how there is now a file called <your_name>\_lesson1.js with the compiled version of your code.
Now open up your medplum.config.json file. Add and entry to the array like this:

Make sure to point to both your source and your dist directory.
Now we’ll try deploying your Bot to the cloud. Medplum ships with a CLI tool that allows you to deploy your bot straight from the terminal. To that, run the following in your command prompt:
npx medplum deploy-bot <your-name>\_lesson1

You’ll notice that you get an error. This is because we need to set up authentication keys between your repo and your project
Navigate to https://app.medplum.com/admin/project
Find the Client App called “BotC lient” and click on it. Find your Client ID and Client secret
Now copy the file .env.example to a file called .env
Set the contents of your .env file to
MEDPLUM_CLIENT_ID=<YOUR_CLIENT_ID>
MEDPLUM_CLIENT_SECRET=<YOUR_CLIENT_SECRET>

These secrets should be considered sensitive data, and should never be checked into GIT. Exposing them to outside actors will give them access to your Medplum data.
Now try running the deploy script. You should see a message that your bot was deployed successfully.
You can also use the Medplum CLI to deploy your bots as part of an automated CI/CD pipeline

## Connecting your Bots

## Setting up Permissions

```

```

## Deploying to multiple Projects
