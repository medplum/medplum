---
sidebar_position: 2
toc_max_heading_level: 3
---

import ExampleCode from '!!raw-loader!@site/../examples/src/bots/finalize-report.test.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Unit Testing Bots

Unit testing your Bot code is crucial to ensuring accurate data and workflows. This guide will go over the most common unit testing patterns.

Medplum provides the [`MockClient`](https://github.com/medplum/medplum/blob/main/packages/mock/src/client.ts#L68) class to help unit test Bots on your local machine. You can also see a reference implementation of simple bots _with tests_ in our [Medplum Demo Bots](https://github.com/medplum/medplum-demo-bots) repo.

## Set up your test framework

The first step is to set up your test framework in your Bots package. Medplum Bots will should work with any typescript/javascript test runner, and the Medplum team has tested our bots with [jest](https://jestjs.io/) and [vitest](https://vitest.dev/). Follow the instructions for your favorite framework to set up you package.

Next you'll want to index the FHIR schema definitions. To keep the client small, the `MockClient` class only ships with a subset of the FHIR schema. Index the full schema as shown below, either in a [`beforeAll` function](https://vitest.dev/api/#beforeall) or [setup file](https://vitest.dev/config/#setupfiles), to make sure your [test queries](##query-the-results) work.

<MedplumCodeBlock language="ts" selectBlocks="index-schema">
{ExampleCode}
</MedplumCodeBlock>

Our [Medplum Demo Bots](https://github.com/medplum/medplum-demo-bots) repo also contains recommended [eslintrc](https://github.com/medplum/medplum-demo-bots/blob/main/.eslintrc.json), [tsconfig](https://github.com/medplum/medplum-demo-bots/blob/main/tsconfig.json), and [vite.config](https://github.com/medplum/medplum-demo-bots/blob/main/vite.config.ts) settings for a faster developer feedback cycle.

## Write your test file

After setting up your framework, you're ready to write your first test file! The most common convention is to create a single test file per bot, named `<botname>.test.ts`.

You will need to import your bot's `handler` function, in addition to the other imports required by your test framework. You'll call this `handler` from each one of your tests.

```typescript
import { handler } from './my-bot';
```

## Write your unit test

Most bot unit tests follow a common pattern:

1. Create a Medplum `MockClient`
2. Create mock resources
3. Invoke the handler function
4. Query mock resources and assert test your test criteria

The [finalize-report tests](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/finalize-report.ts) are a great example of this pattern.

### Create a `MockClient`

The Medplum `MockClient` class extends the `MedplumClient` class, but stores resources in local memory rather than persisting them to the server. This presents a type-compatible interface to the Bot's handler function, which makes it ideal for unit tests.

<MedplumCodeBlock language="ts" selectBlocks="create-client">
{ExampleCode}
</MedplumCodeBlock>

We recommend creating a `MockClient` at the beginning of each test, to avoid any cross-talk between tests.

:::warning Caution

The MockClient does not yet _perfectly_ replicate the functionality of the `MedplumClient` class, as this would require duplicating the entire server codebase. Some advanced functionality does not yet behave the same between `MockClient` and `MedplumClient`, including:

- `medplum.graphql`
- `medplum.executeBatch`
- FHIR $ operations

The Medplum team is working on bringing these features to parity as soon as possible. You can join our Github discussion [here](https://github.com/medplum/medplum/discussions/1218)

:::

### Create mock resource resources

Most tests require setting up some resources in the mock environment before running the Bot. You can use `createResource()` and `updateResource()` to add resources to your mock server, just as you would with a regular `MedplumClient` instance.

The [finalize-report bot](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/finalize-reports.test.ts) from [Medplum Demo Bots](https://github.com/medplum/medplum-demo-bots/) provides a good example. Each test sets up a [Patient](/docs/api/fhir/resources/patient), an [Observation](/docs/api/fhir/resources/observation), and a [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) before invoking the bot.

<DetailsBlock summary="Example: Create Resources">
  <MedplumCodeBlock language="ts" selectBlocks="create-resources">
    {ExampleCode}
  </MedplumCodeBlock>
</DetailsBlock>

### Invoke your Bot

After setting up your mock resources, you can invoke your bot by calling your bot's handler function. See the ["Bot Basics" tutorial](/docs/bots/bot-basics#editing-a-bot) for more information about the arguments to `handler`

<MedplumCodeBlock language="ts" selectBlocks="invoke-bot">
{ExampleCode}
</MedplumCodeBlock>

### Query the results

Most of the time, Bots will create or modify resources on the Medplum server. To test your bot, you can use your `MockClient` to query the state of resources on the server, just as you would with a `MedplumClient` in production.

To check the bot's response, simply check the return value of your `handler` function.

The after running the Bot, the [finalize-report bot's tests](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/finalize-reports.test.ts) read the updated `DiagnosticReport` and `Observation` resources to confirm their status.

<DetailsBlock summary="Example: Query the results">
  <MedplumCodeBlock language="ts" selectBlocks="query-results">
  {ExampleCode}
  </MedplumCodeBlock>
</DetailsBlock>

:::note A note on idempotency
Many times, you'd like to make sure your Bot is [idempotent](https://en.wikipedia.org/wiki/Idempotence#Computer_science_meaning). This can be accomplished by calling your bot twice, and using your test framework's `spyOn` functions to ensure that no resources are created/updated in the second call.

<DetailsBlock summary="Example: Idempotency test">
  <MedplumCodeBlock language="ts" selectBlocks="test-idempotent">
    {ExampleCode}
  </MedplumCodeBlock>
</DetailsBlock>

:::
