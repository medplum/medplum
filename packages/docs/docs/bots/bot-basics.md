---
sidebar_position: 1
toc_max_heading_level: 2
---

# Bot Basics

Bots are an advanced Medplum feature that enable complex workflows. A **Medplum Bot** is a snippet of JavaScript code that can run on any resource change (create or update). This JavaScript code has access to a [**Medplum client**](../sdk) , which itself can invoke FHIR operations.

**Medplum Bots** are run as [AWS Lambdas](https://aws.amazon.com/lambda/) and in heavily sandboxed environments.
You can apply an [AccessPolicy](/docs/access/access-policies) to the Bot if you want to further reduce the data it can read and write.

Bots are disabled by default for accounts. Contact info@medplum.com if you'd like to learn more.

:::note Bots in Local Development

If you want to run bots locally, you should use a VM Context. For more details see the [VM Context Bots docs](/docs/bots/vm-context-bots).

:::

## Example uses

Consider some of these Bot use cases:

- Adding default values to blank or missing properties
- Custom data validation for custom business rules
- Creating communications for new patients
- Creating notifications for new lab results or reports
- Creating one or more resources for a Questionnaire Response

These capabilities would normally require writing custom code, HTTP servers, webhooks, and managing credentials for a separate service.

By using Bots, the entire logic is self contained and managed in one place. Like all FHIR resources in Medplum, the [Bot resource](https://app.medplum.com/Bot) is versioned with full history tracking, so you can see exactly what changed over time.

## Creating a Bot

:::caution Note

Bots are disabled by default. Contact your info@medplum.com if you'd like to learn more.

:::

:::caution Note

Bots are restricted to Project administrators. If you do not have access, contact your Project administrator.

:::

To create a Bot, navigate to the [Project Admin panel](https://app.medplum.com/admin/project) and click "Create new Bot".

![Create a Bot](/img/app/bots/create_bot.png)

On the next page you can enter a bot **name** and **description** (optional). You can also optionally set an [**access policy**](/docs/access/access-policies) on the Bot, which can restrict the read/write privileges of the bot's code. By default, Bots have read/write access to all resources.

![Enter Bot Properties](/img/app/bots/enter_bot_properties.png)

Click "Create Bot" to save the Bot, and you will see an acknowledgement that the Bot has been created.

![Bot Created Acknowledgement](/img/app/bots/bot_created_acknowledgement.png)

## Editing a Bot

You can see all Bots in your account on the Bot resource page: [https://app.medplum.com/Bot](https://app.medplum.com/Bot)

Click on your new Bot and navigate to the **Editor** tab. This presents a code editing window where you can write your
Javascript code.

![Bot Editor](/img/app/bots/BotResourcePage.gif)

All Bots are simply a single TypeScript/JavaScript file with a standard async entry point function called `handler`. To start your bot, create a `handler` function as shown below in the **Editor** window.

```typescript
import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Your code here
}
```

The following function arguments are available to the Bot code, to enable it to do the functionality it requires.

| Name          | Type                                                                        | Description                                                                         |
| ------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `medplum`     | [MedplumClient](../sdk/core.medplumclient)                                  | An instance of the medplum JS SDK ([documentation](../sdk/))                        |
| `event`       | [BotEvent](../sdk/core.botevent)                                            | The event that object that triggered the Bot                                        |
| `event.input` | `string` &#124; `Resource` &#124; `Hl7Message` &#124; `Record<string, any>` | The bot input, usually a FHIR resource or content that was posted to a bot endpoint |

In this example, we'll assume the input is a `Patient` resource and print out the patient's name.

```ts
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

When you are done editing, click "Save" to save your Bot code to Medplum.

### Understanding the code

Let's break this example down.

```ts
import { Patient } from '@medplum/fhirtypes';
//....
const patient = event.input as Patient;
```

This first line casts the contents of event.input of type `Patient`. This allows the rest of the bot code to take advantage of TypeScript's strong type system, along with IDE autocomplete and ESLint verification. Medplum provides type definitions for all FHIR resources in the `@medplum/fhirtypes` package.

```ts
const firstName = patient.name?.[0]?.given?.[0];
const lastName = patient.name?.[0]?.family;
```

This line extracts the first and last name for the patient. Since patients can have many different names (e.g. maiden name, common name, official name), `Patient.name` is an array. In this example, we will only consider the `0th` name entry.

FHIR stores a person's first names, middle names, etc. in an array called `HumanName.given`, and the last name in the `HumanName.family` property. For more information, refer to the documentation for the [`HumanName` datatype](/docs/api/fhir/datatypes/humanname).

Because these properties may be undefined, we make heavy use of the Javascript [optional chaining (`?.`) operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) to access these properties.

## Deploying a Bot

Clicking "Save" in the **Editor** tab persists your Bot code to the Medplum database, but _doesn't_ deploy your to run in production.
To deploy your bot, click the "Deploy" button.

![Deploy Button](/img/app/bots/deploy_button.png)

This works well for initial prototyping, but as you get closer to a production implementation [deploying from the command line](/docs/bots/bots-in-production#deploying-your-bot) potentially as part of a CI/CD can be preferred.

**Medplum Bots** are run as [AWS Lambdas](https://aws.amazon.com/lambda/) and in heavily sandboxed environments.
You can apply an [AccessPolicy](/docs/access/access-policies) to the Bot if you want to further reduce the data it can read and write.

## Executing a Bot

Once your bot has been [saved](#editing-a-bot) and [deployed](#deploying-a-bot), it is time to execute the bot.
There are a few different ways a bot can be executed:

1. Clicking the "Execute" button in the **Bot Code Editor**
1. Sending a POST request to the [`$execute` endpoint](/docs/api/fhir/operations/bot-execute)
1. Setting up a [Subscription](/docs/fhir-basics#listening-for-changes-subscriptions) to execute the Bot automatically based on changes (see next section).

### _Executing from the Code Editor_

The simplest way to to execute a bot is to click the "Execute" button inside the Bot's **Editor** tab.
This will execute the most recently deployed version of your Bot, with the `event.input` set to the contents of the
**Input Pane**.

![Execute from Editor](/img/app/bots/execute_from_editor.png)

### _Using the `$execute` endpoint_

You can also execute a bot programmatically by sending an HTTP `POST` request to the Bot's `$execute`. Below is an example request sent with [`cURL`](https://en.wikipedia.org/wiki/CURL):

```bash
curl -x POST 'https://api.medplum.com/fhir/R4/Bot/<BOT_ID>/$execute' \
  --header 'Content-Type: <CONTENT_TYPE>' \
  --header 'Authorization: Bearer <ACCESS_TOKEN>' \
  --data '<INPUT_DATA>'
```

Let's walk through each of the parameters here in more detail.

#### `BOT_ID`

You can find the `id` of your Bot by clicking on the **Details** tab of the Bot resource. In this example, it is ` 43ac3060-ff20-49e8-9682-bf91ab3a5191`

<img src="/img/app/bots/find_bot_id.png" width="50%" height="50%" alt="Find your Bot ID" title="Find your Bot ID" />

#### `CONTENT_TYPE`

| Content-Type                         | typeof `event.input`                   | Description                                                                                                                                                         |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text/plain`                         | `string`                               | `<INPUT_DATA>` is parsed as plaintext string                                                                                                                        |
| `application/json`                   | `Record<string, any>`                  | `<INPUT_DATA>` is parsed as JSON-encoded object                                                                                                                     |
| `application/x-www-form-urlencoded ` | `Record<string, string>`               | `<INPUT_DATA>` is parsed as URL-encoded string, resulting in a key/value map                                                                                        |
| `application/fhir+json`              | [`Resource`](/docs/api/fhir/resources) | `<INPUT_DATA>` is parsed as a [FHIR Resource](/docs/fhir-basics#storing-data-resources) encoded as JSON                                                             |
| `x-application/hl7-v2+er7`           | [`HL7Message`](../sdk/core.hl7message) | `<INPUT_DATA>` is a string that should be parsed as a pipe-delimited HL7v2 message. HL7v2 is a common text-based message protocol used in legacy healthcare systems |

#### `ACCESS_TOKEN`

This is the `access_token` you receive after completing the OAuth authentication flow. See [this how-to](/docs/auth/methods/client-credentials#connecting-to-the-service) for more information.

#### `INPUT_DATA`

This is the input data that will be parsed according to `CONTENT_TYPE` and passed into your Bot as `event.input`.

Read more in the [Bot `$execute`](/docs/api/fhir/operations/bot-execute) documentation.

### _Executing automatically using a [`Subscription`](/docs/fhir-basics#listening-for-changes-subscriptions)_

While using the `$execute` endpoint allows developers to trigger Bots from 3rd party applications, the most common way to execute a bot is to use a [FHIR subscription](/docs/fhir-basics#listening-for-changes-subscriptions) to trigger the Bot whenever a resource has been updated.

Let's connect our bot to [`Patient`](/docs/api/fhir/resources/patient) resources. That means that the Bot code will run on any "create" or "update" operation to any [`Patient`](/docs/api/fhir/resources/patient).

:::note
Bots can be run as a cron job. [Click Here](/docs/bots/bot-cron-job) to learn more.
:::

First, go to the [Subscription](https://app.medplum.com/Subscription) resources page.

Then click on the "New..."

![New Subscription](/img/app/bots/new_subscription.png)

To ensure the Subscription is running, change "Status" to `Active`

![Activate Subscription](/img/app/bots/subscription_active.png)

Specify which Resources will trigger this subscription using a FHIR search string. If you're not familiar with FHIR search semantics, check out [this tutorial](../search/basic-search) for a primer.

For this example, we will trigger the Subscription after a change to _any_ `Patient` resource.

Change "Criteria" field to `Patient`

![Subscription Criteria](/img/app/bots/subscription_criteria.png)

:::warning Subscriptions on `AuditEvents`

The criteria of a subscription cannot be set to an [`AuditEvent`](/docs/api/fhir/resources/auditevent) resource. When a subscription is triggered it creates an [`AuditEvent`](/docs/api/fhir/resources/auditevent), so using it as criteria would create a notification spiral.

:::

Next, we specify action should be taken when the subscription is triggered, using the "Channel" field.

Because, Bots can be are executed using HTTP requests, we will select the Channel "Type" as `Rest Hook` and the Channel "Endpoint" as as `Bot/<BOT_ID>`.

![Subscription Channel](/img/app/bots/subscription_channel.png)

Change "Payload" to `application/fhir+json`. This is similar to the [CONTENT_TYPE](#content_type) field used by the `$execute` endpoint.

![Subscription Payload](/img/app/bots/subscription_payload.png)

Finally, scroll down and click "OK".

**Congratulations!** Now you have an active Subscription. ([View all Subscriptions](https://app.medplum.com/Subscription))

We can test our new subscription by creating a new `Patient`. First, go to the [Patient resources](https://app.medplum.com/Patient) using the top-left menu and clicking "Patient"

<img src='/img/app/bots/patient_sidebar.png' alt='Patient Sidebar' style={{'max-width': '40%'}}/>

Next, click on the "New..." [button](https://app.medplum.com/Patient/new)
![New Patient Button](/img/app/bots/new_patient_button.png)

Enter a sample name such as given "Jane" family "Doe". Then Scroll down and click "OK"

![Create new Patient](/img/app/bots/NewPatient.gif)

Now, let's go back to our [`Subscription`](https://app.medplum.com/Subscription). On the Timeline, you should see an `AuditEvent` with the outcome of the JavaScript code execution. If everything worked as expected, you should see "Hello Jane Doe" logged as part of the `AuditEvent`.

<img src='/img/app/bots/auditevent.png' alt='Audit Event' style={{'max-width': '60%'}}/>

If you want to see all `AuditEvents` sorted by most recent, you can use [this link](https://app.medplum.com/AuditEvent?_count=20&_fields=outcomeDesc,_lastUpdated,entity&_offset=0&_sort=-_lastUpdated).

![All Audit Event](/img/app/bots/all_audit_events.png)

## Software Development Lifecycle

Bots written using the web editor are a great way to get started. If you would like to develop locally, test and deploy apps as part of your software development lifecycle, you refer to our next tutorial on [deploying Bots in production](./bots-in-production)
