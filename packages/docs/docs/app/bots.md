---
sidebar_position: 100
---

# Medplum Bots

Bots are an advanced Medplum feature that enable complex workflows.

Bots are disabled by default for accounts. Contact info@medplum.com if you'd like to learn more.

## What is a Medplum bot?

A Medplum bot is a snippet of JavaScript code that can run on any resource change (create or update). This JavaScript code has access to a FHIR client, which itself can invoke FHIR operations.

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

## Create your first bot

**Note:** Bots are disabled by default. Contact your info@medplum.com if you'd like to learn more.

**Note:** Bots are restricted to Project administrators. If you do not have access, contact your Project administrator.

Create a Bot from the [Project Admin panel](https://app.medplum.com/admin/project).

Enter a Bot name. For the first version of our Bot, let's enter the code:

```javascript
export async function handler(medplum, event) {
  console.log('Hello world');
}
```

Scroll to the bottom and click "OK".

Make note of the Bot "id" which we will need in the next step. (You can see all Bots in your account on the [Bot resource page](https://app.medplum.com/Bot))

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

Now you have an active Subscription. ([View all Subcriptions](https://app.medplum.com/Subscription))

## Execute the bot

With our [Bot](https://app.medplum.com/Bot) and [Subscription](https://app.medplum.com/Subscription) in place, let's trigger the Bot.

- First, go to the [Patient resources](https://app.medplum.com/Patient) using the top-left menu and clicking "Patient"
- Next, click on the "New..." [button](https://app.medplum.com/Patient/new)
- Enter a sample name such as given "Jane" family "Doe"
- Scroll down and click "OK"

Now, let's go back to our [Subscription](https://app.medplum.com/Subscription). On the Timeline, you should see an AuditEvent with the outcome of the JavaScript code execution. If everything worked as expected, you should see "Hello world" logged as part of the AuditEvent.  If you want to see all AuditEvents sorted by most recent, you can use [this link](https://app.medplum.com/AuditEvent?_count=20&_fields=id,_lastUpdated&_offset=0&_sort=-_lastUpdated).

## Bot sandbox

The JavaScript code is heavily sandboxed and runs in an AWS Lambda.  You can apply an [AccessPolicy](https://app.medplum.com/AccessPolicy) to the Bot if you want to further reduce the data it can read and write.

The following function arguments are available to the Bot code, to enable it to do the functionality it requires.

| Name              | Type     | Description                                                                       |
| ----------------- | -------- | --------------------------------------------------------------------------------- |
| `medplum`       | [MedplumClient](https://docs.medplum.com/typedoc/core/classes/MedplumClient.html)   | An instance of the medplum JS SDK ([documentation](https://docs.medplum.com/typedoc/core/index.html))                             |
| `event`         | BotEvent   | The event that object that triggered the Bot |
| `event.input`   | object   | The bot input, usually a FHIR object or content that was posted to a bot endpoint                                              |

### medplum

The [Medplum JS client library](https://docs.medplum.com/typedoc/core/index.html), use this library to read and write FHIR resources.  

For example, you can use `medplum` in your Bot using the following:

```javascript
const patient = await medplum.readResource('Patient', 'fdbaf571-919a-4a08-a671-7dffe4340da8');
```

### event

This is a JSON object representing the event that triggered the Lambda.

### event.input

This is the content that was input into the Lambda.  In this example it will be the `Patient` resource because we set up the [Subscription](https://app.medplum.com/Subscription) to fire when the `Patient` resource is edited.

## Logging

A `console`-like variable that can be used for logging output to [AuditEvent](https://docs.medplum.com/api/fhir/resources/auditevent).

Example:

```javascript
export async function handler(medplum, event) {
  console.log('Hello world');
}
```

AuditEvents viewable on either the [Subscription](https://app.medplum.com/Bot) page or the [Bot](https://app.medplum.com/Bot) Page.  You can view all [AuditEvents](https://app.medplum.com/AuditEvent) in the webapp as well.

## Special Topics

It is also possible to trigger Bots by posting to a Bot `$execute` endpoint.  We won't discuss this in depth here, but you can see many examples of this in the [Bots Tutorials](https://docs.medplum.com/tutorials/bots/intro) section.

Bots written using the web editor should be written in Javascript.  If you would like to develop locally, test and deploy apps as part of your software development lifecycle, you can use our [Bot CLI](https://github.com/medplum/medplum-demo-bots).