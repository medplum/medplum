---
sidebar_position: 2
toc_max_heading_level: 2
---

# Setting up your Bot Development Repo

## Preamble

_why_ Editing bots in the web editor is good for getting started quickly, but as Bots become more important you will want to manage them as part of your regular software development process. This means:

- Storing bot code in source control
- PRs / CRs for your bots
- Write unit tests for your bot
- Set up a CI/CD pipeline for your bots

In this tutorial, we'll walk through the process of setting up a repository to host the code for your Bots, and using the [Medplum CLI](#) to save and deploy your bots in production.

## Setting up your Repository

The first thing we'll do is set up a Git repository to host your Bot code. While you can set up bots in any git repository, we provide a [template Git repository](#) to help you get started.

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
cp bot.ts.example my-bot.ts
```

## Write your Bot

Next, cd into the src directory and make a copy of the file examples/hello-world.ts with the name <your_name>\_lesson1.ts
Let’s pause to examine the method signature
The first line imports 2 types from our ‘@medplum/core’ library.
The next line is the function signature
The function must be named “handler”
The function must be exported, and must be marked as “async”
A Bot always receives two parameters
Medplum is the client, which is a wrapper around our API that provide a ton of convenience functions. You can find reference documentation at https://docs.medplum.com/sdk
event contains metadata about the event, including the input data
import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
console.log('Hello world');
console.log(JSON.stringify(event, undefined, 2));
return true;
}

The next thing we’ll do is read the input that is sent to the Bot. For this example, we’ll assume that the input to the bot is a Patient resource
The input is stored in event.input. Please write the following line:
const patient = event.input as Patient;

This casts the contents of event.input of type Patient. You’ll notice that you’re getting an error because the Patient type isn’t recognized. You’ll need to import it form the @medplum/fhirtypes package
import {Patient} from '@medplum/fhirtypes'

Next, we’ll extract the first and last names from the patient. Since patients can have many different names, `Patient.name` is an array.
To get the last name, we’ll find the 0th entry for name, and read the “family” property
const lastName = patient.name?.[0]?.family

The “?” operator in JS/TS means “return this property if it exists, else return undefined”. Because in FHIR we deal with lots of nested properties, you’ll tend to see long chains with the “?” operator
To get the first name, we’ll find the 0th entry for name, and read the “given” property. In our data model, the “given” is an array, and houses first and middle names. For this Bot, we’ll just take the first entry from the “given” name.
const firstName = patient.name?.[0]?.given?.[0]

Now for the last step, we will send an email to ourselves. Use the medplum.sendEmail() method to send an email to your kit email address.
await medplum.sendEmail({
to: '<YOUR_EMAIL>@kit.com',
subject: `Hello ${firstName} ${lastName}`,
text: '',
});

Don’t forget the “await” keyword that will block until the email is sent.
The backticks and ${} syntax is JS syntax for template literals

Project Configuration [15 min]
Congratulations! You’ve just written your first bot. The next step is the take the code in your file, and deploy it to the Bot you created in the Medplum App.
First, compile you code:
npm run build

Next, take a look at your “dist/” directory. Notice how there is now a file called <your_name>\_lesson1.js with the compiled version of your code.
Now open up your medplum.config.json file. Add and entry to the array like this:
{
"bots": [
//…
{
"name": "<your_name>_lesson1",
"id": "<YOUR_BOT_ID>",
"source": "src/<your_name>_lesson1.ts",
"dist": "dist/<your_name>_lesson1.js"
}
]
}

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
