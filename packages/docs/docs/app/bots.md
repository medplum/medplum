---
sidebar_position: 100
---

# Medplum Bots

Bots are an advanced Medplum feature that enable complex workflows.

Bots are disabled by default. Contact your account manager if you'd like to learn more.

## What is a Medplum bot?

A Medplum bot is a snippet of JavaScript code that can run on any resource change (create or update). This JavaScript code has access to a FHIR client, which itself can invoke FHIR operations.

## Example uses

Consider some of these Bot use cases:

- Adding default values to blank or missing properties
- Custom data validation for custom business rules
- Creating communications for new patients
- Creating communications for new lab results or reports
- Creating one or more resources for a Questionnaire Response

These capabilities would normally require writing custom code, HTTP servers, webhooks, and managing credentials for a separate service.

By using Bots, the entire logic is self contained and managed in one place. Like all FHIR resources in Medplum, the Bot resource is versioned with full history tracking, so you can see exactly what changed over time.

## Create your first bot

**Note:** Bots are disabled by default. Contact your account manager if you'd like to learn more.

**Note:** Bots are restricted to Project administrators. If you do not have access, contact your Project administrator.

First, go to the Bot resources using the top-left menu and then click "Bots".

Next, click on the "New..." button.

Enter a Bot name. For the first version of our Bot, let's enter the code:

```javascript
console.log('Hello world');
```

Scroll to the bottom and click "OK".

Make note of the Bot "id" which we will need in the next step.

## Setup the bot subscription

Bots are triggered using FHIR [Subscriptions](/docs/api/fhir/resources/subscription).

Let's connect our bot to [Patient](/docs/api/fhir/resources/patient) resources. That means that the Bot code will run on any "create" or "update" operation to any "Patient".

- First, go to the Subscription resources using the top-left menu and then click "Subscriptions".
- Next, click on the "New..." button.
- Change "Status" to "Active"
- Change "Criteria" to "Patient"
- Change "Channel" "Type" to "Rest Hook"
- Change "Endpoint" to "Bot/MY_ID", such as "Bot/6867304f-4a34-44d3-b0bd-9e423310449e"
- Change "Payload" to "application/fhir+json"
- Scroll down and click "OK"

Now you have an active Subscription.

## Execute the bot

With our Bot and Subscription in place, let's trigger the Bot.

- First, go to the Patient resources using the top-left menu and clicking "Patient"
- Next, click on the "New..." button
- Enter a sample name such as given "Bot" family "Demo"
- Scroll down and click "OK"

Now, let's go back to our Subscription. On the Timeline, you should see an AuditEvent with the outcome of the JavaScript code execution. If everything worked as expected, you should see "Hello world" in the "outcomeDesc" property.

## Bot sandbox

The JavaScript code is heavily sandboxed for security reasons. Only a handful of variables are exposed:

| Name              | Type     | Description                                                                       |
| ----------------- | -------- | --------------------------------------------------------------------------------- |
| `resource`        | object   | The FHIR resource that triggered the bot/subscription                             |
| `console`         | object   | A normal console-like variable that can be used for logging output to AuditEvents |
| `repo`            | object   | A FHIR repository helper. See below.                                              |
| `assertOk`        | function | Helper function to validate the outcome of a repository call. See below.          |
| `createReference` | function | Helper function to create FHIR References from FHIR Resources.                    |

### resource

The FHIR resource as a plain old JavaScript object.

### console

A `console`-like variable that can be used for logging output to AuditEvents.

Example:

```javascript
console.log('Example');
```

### repo

A FHIR repository helper. The helper exposes a number of utility methods for managing FHIR resources:

#### createResource

`async createResource<T extends Resource>(resource: T): RepositoryResult<T>`

Creates a resource

#### readResource

`async readResource<T extends Resource>(resourceType: string, id: string): RepositoryResult<T>`

Reads a resource by type and ID

#### updateResource

`async updateResource<T extends Resource>(resource: T): RepositoryResult<T>`

Updates a resource

#### deleteResource

`async deleteResource(resourceType: string, id: string): RepositoryResult<void>`

Deletes a resource

#### patchResource

`async patchResource(resourceType: string, id: string, patch: Operation[]): RepositoryResult<Resource>`

Patches a resource

#### RepositoryResult

`type RepositoryResult<T extends Resource | undefined> = Promise<[OperationOutcome, T | undefined]>;`

A `RepositoryResult` is a Promise to an array with two elements: the `OperationOutcome` and an optional `Resource`.
