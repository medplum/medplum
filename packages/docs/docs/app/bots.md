---
sidebar_position: 100
toc_max_heading_level: 2
---

# Medplum Bots

Bots are an advanced Medplum feature that enable complex workflows. A **Medplum Bot** is a snippet of JavaScript code that can run on any resource change (create or update). This JavaScript code has access to a [**Medplum client**](/sdk) , which itself can invoke FHIR operations.

Bots are disabled by default for accounts. Contact info@medplum.com if you'd like to learn more.

## Example uses

Consider some of these Bot use cases:

- Adding default values to blank or missing properties
- Custom data validation for custom business rules
- Creating communications for new patients
- Creating notifications for new lab results or reports
- Creating one or more resources for a Questionnaire Response

These capabilities would normally require writing custom code, HTTP servers, webhooks, and managing credentials for a separate service.

By using Bots, the entire logic is self contained and managed in one place. Like all FHIR resources in Medplum, the [Bot resource](https://app.medplum.com/Bot) is versioned with full history tracking, so you can see exactly what changed over time.

We have a full suite of detailed [Bot tutorials](https://docs.medplum.com/tutorials/bots/intro) that go through use cases in detail.

## Creating a Bot

:::caution Note

Bots are disabled by default. Contact your info@medplum.com if you'd like to learn more.

:::

:::caution Note

Bots are restricted to Project administrators. If you do not have access, contact your Project administrator.

:::

To create a Bot, navigate to the [Project Admin panel](https://app.medplum.com/admin/project) and click "Create new Bot".

![Create a Bot](/img/app/bots/create_bot.png)

On the next page you can enter a bot **name** and **description** (optional). You can also optionally set an [**access
policy**](app/access-control#access-policies) on the Bot, which can restrict the read/write privileges of the bot's
code. By default, Bots have read/write access to all resources.

![Enter Bot Properties](/img/app/bots/enter_bot_properties.png)

Click "Create Bot" to save the Bot, and you will see an acknowledgement that the Bot has been created.

![Bot Created Acknowledgement](/img/app/bots/bot_created_acknowledgement.png)

## Editing a Bot

You can see all Bots in your account on the Bot resource page: [https://app.medplum.com/Bot](https://app.medplum.com/Bot)

Click on your new Bot and navigate to the **Editor** tab. This presents a code editing window where you can write your
Javascript code.

![Bot Editor](/img/app/bots/BotResourcePage.gif)

All Bots are simply a single Javascript file with a standard async entry point function called `handler`. To start your bot, create a `handler` function as shown below in the **Editor** window.

```javascript
export async function handler(medplum, event) {
  // Your code here
}
```

The following function arguments are available to the Bot code, to enable it to do the functionality it requires.

| Name          | Type                                           | Description                                                                                           |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `medplum`     | [MedplumClient](/sdk/classes/MedplumClient)    | An instance of the medplum JS SDK ([documentation](https://docs.medplum.com/typedoc/core/index.html)) |
| `event`       | [BotEvent](/sdk/interfaces/BotEvent)           | The event that object that triggered the Bot                                                          |
| `event.input` | `string` &#124; `Resource` &#124; `Hl7Message` | The bot input, usually a FHIR resource or content that was posted to a bot endpoint                   |

When you are done editing, click "Save" to save your Bot code to Medplum.

## Deploying a Bot

Clicking "Save" in the **Editor** tab persists your Bot code to the Medplum database, but _doesn't_ deploy your to run in production.
To deploy your bot, click the "Deploy" button.

:::danger Screenshot
:::

**Medplum Bots** are run as [AWS Lambdas](https://aws.amazon.com/lambda/) and in heavily sandboxed environments.
You can apply an [AccessPolicy](/access-control#access-policies) to the Bot if you want to further reduce the data it can read and write.

## Executing a Bot

Once your bot has been [saved](#editing-a-bot) and [deployed](#deploying-a-bot), it is time to execute the bot.
There are a few different ways a bot can be executed:

1. Clicking the "Execute" button in the **Bot Code Editor**
1. Sending a POST request to the `$execute` endpoint
1. Setting up a [Subscription](/fhir-basics#subscriptions-listening-for-changes) to execute the Bot automatically
   based on changes (see next section).

### Executing from the Code Editor

The simplest way to to execute a bot is to click the "Execute" button inside the Bot's **Editor** tab.
This will execute the most recently deployed version of your Bot, with the `event.input` set to the contents of the
**Input Pane**.

![Execute from Editor](/img/app/bots/execute_from_editor.png)

### Using the `$execute` endpoint

You can also execute a bot programmatically by sending an HTTP `POST` request to the Bot's `$execute`. Below is an example request sent with [`cURL`](https://en.wikipedia.org/wiki/CURL):

```bash
curl -x POST 'https://api.medplum.com/fhir/R4/Bot/<BOT_ID>/$execute' \
  --header 'Content-Type: <CONTENT_TYPE>' \
  --header 'Authorization: Bearer <ACCESS_TOKEN>' \
  --data '<INPUT_DATA>
```

Let's walk through each of the parameters here in more detail.

#### `BOT_ID`

You can find the `id` of your Bot by clicking on the **Details** tab of the Bot resource. In this example, it is ` 43ac3060-ff20-49e8-9682-bf91ab3a5191`

<img src='/img/app/bots/find_bot_id.png'/>

#### `CONTENT_TYPE`

| Content-Type               | typeof `event.input`                    | Description                                                                                                                                                         |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application/fhir+json`    | [`Resource`](/category/resources)       | `<INPUT_DATA>` is parsed as a [FHIR Resource](/fhir-basics#resources) encoded as a JSON string                                                                      |
| `text/plain`               | `string`                                | `<INPUT_DATA>` is parsed as plaintext string                                                                                                                        |
| `x-application/hl7-v2+er7` | [`HL7Message`](/sdk/classes/Hl7Message) | `<INPUT_DATA>` is a string that should be parsed as a pipe-delimited HL7v2 message. HL7v2 is a common text-based message protocol used in legacy healthcare systems |

## Triggering a Bot

TODO

## Setup the bot subscription

Bots can be triggered using FHIR [Subscriptions](/api/fhir/resources/subscription).

Let's connect our bot to [Patient](/api/fhir/resources/patient) resources. That means that the Bot code will run on any "create" or "update" operation to any "Patient".

- First, go to the [Subscription](https://app.medplum.com/Subscription) resources page.
- Next, click on the "New..." [button](https://app.medplum.com/Subscription/new).
- Change "Status" to "Active"
- Change "Criteria" to `Patient`
- Change "Channel" "Type" to "Rest Hook"
- Change "Endpoint" to "Bot/MY_ID", such as "Bot/6867304f-4a34-44d3-b0bd-9e423310449e"
- Change "Payload" to "application/fhir+json"
- Scroll down and click "OK"

Now you have an active Subscription. ([View all Subscriptions](https://app.medplum.com/Subscription))

## Execute the bot

With our [Bot](https://app.medplum.com/Bot) and [Subscription](https://app.medplum.com/Subscription) in place, let's trigger the Bot.

- First, go to the [Patient resources](https://app.medplum.com/Patient) using the top-left menu and clicking "Patient"
- Next, click on the "New..." [button](https://app.medplum.com/Patient/new)
- Enter a sample name such as given "Jane" family "Doe"
- Scroll down and click "OK"

Now, let's go back to our [Subscription](https://app.medplum.com/Subscription). On the Timeline, you should see an AuditEvent with the outcome of the JavaScript code execution. If everything worked as expected, you should see "Hello world" logged as part of the AuditEvent. If you want to see all AuditEvents sorted by most recent, you can use [this link](https://app.medplum.com/AuditEvent?_count=20&_fields=id,_lastUpdated&_offset=0&_sort=-_lastUpdated).

## Bot sandbox

The JavaScript code is heavily sandboxed and runs in an AWS Lambda. You can apply an [AccessPolicy](https://app.medplum.com/AccessPolicy) to the Bot if you want to further reduce the data it can read and write.

The following function arguments are available to the Bot code, to enable it to do the functionality it requires.

| Name          | Type                                                                              | Description                                                                                           |
| ------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `medplum`     | [MedplumClient](https://docs.medplum.com/typedoc/core/classes/MedplumClient.html) | An instance of the medplum JS SDK ([documentation](https://docs.medplum.com/typedoc/core/index.html)) |
| `event`       | BotEvent                                                                          | The event that object that triggered the Bot                                                          |
| `event.input` | object                                                                            | The bot input, usually a FHIR object or content that was posted to a bot endpoint                     |

### medplum

The [Medplum JS client library](https://docs.medplum.com/typedoc/core/index.html), use this library to read and write FHIR resources.

For example, you can use `medplum` in your Bot using the following:

```javascript
const patient = await medplum.readResource('Patient', 'fdbaf571-919a-4a08-a671-7dffe4340da8');
```

### event

This is a JSON object representing the event that triggered the Lambda.

### event.input

This is the content that was input into the Lambda. In this example it will be the `Patient` resource because we set up the [Subscription](https://app.medplum.com/Subscription) to fire when the `Patient` resource is edited.

## Logging

A `console`-like variable that can be used for logging output to [AuditEvent](https://docs.medplum.com/api/fhir/resources/auditevent).

Example:

```javascript
export async function handler(medplum, event) {
  console.log('Hello world');
}
```

AuditEvents viewable on either the [Subscription](https://app.medplum.com/Bot) page or the [Bot](https://app.medplum.com/Bot) Page. You can view all [AuditEvents](https://app.medplum.com/AuditEvent) in the webapp as well.

## Special Topics

It is also possible to trigger Bots by posting to a Bot `$execute` endpoint. We won't discuss this in depth here, but you can see many examples of this in the [Bots Tutorials](https://docs.medplum.com/tutorials/bots/intro) section.

Bots written using the web editor should be written in Javascript. If you would like to develop locally, test and deploy apps as part of your software development lifecycle, you can use our [Bot CLI](https://github.com/medplum/medplum-demo-bots).
