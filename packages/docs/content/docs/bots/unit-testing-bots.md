---
id: unit-testing-bots
title: Unit Testing Bots
description: Test Bot handlers with MockClient, then verify permissions, triggers, and runtime behavior in a test project.
weight: 30
toc_max_heading_level: 3
---

Call your Bot handler with a `MockClient` to test its resource transformations and failure paths locally. Then use a separate test project to verify server permissions, subscriptions, and deployed runtime behavior.

The [Medplum Demo Bots](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots) example contains handlers, tests, and configuration you can use as a starting point.

## Set up your test framework

The examples in this guide use [Vitest](https://vitest.dev/), which is also the test runner used by the Medplum monorepo. Configure Vitest in your Bots package before running the examples.

Next you'll want to index the FHIR schema definitions. To keep the client small, the `MockClient` class only ships with a subset of the FHIR schema. Index the full schema as shown below, either in a [`beforeAll` function](https://vitest.dev/api/#beforeall) or [setup file](https://vitest.dev/config/#setupfiles), to make sure your [test queries](#query-the-results) work.

```typescript
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { beforeAll } from 'vitest';

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }
});
```

The maintained [demo Bots example](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots) includes [TypeScript configuration](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/tsconfig.json) and [Vitest configuration](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/vite.config.ts).

## Write your test file

Create a test file beside your handler, named `<botname>.test.ts`.

You will need to import your bot's `handler` function, in addition to the other imports required by your test framework. You'll call this `handler` from each one of your tests.

```typescript
import { handler } from './my-bot';
```

## Write your unit test

Most bot unit tests follow a common pattern:

1. Create a Medplum `MockClient`
2. Create mock resources
3. Invoke the handler function
4. Query the resulting resources and assert the expected behavior

The [finalize-report tests](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/finalize-reports.test.ts) demonstrate this pattern.

### Create a `MockClient`

The Medplum `MockClient` class extends the `MedplumClient` class, but stores resources in local memory rather than persisting them to the server. This presents a type-compatible interface to the Bot's handler function, which makes it ideal for unit tests.

{{< code-example file="examples/medplum-demo-bots/src/finalize-reports.test.ts" language="ts" blocks="create-client" >}}

We recommend creating a `MockClient` at the beginning of each test, to avoid any cross-talk between tests.

{{< warning title="Verify server behavior separately" >}}

The in-memory repository supports chained searches and `_include` / `_revinclude`. Use a test server to verify behavior that depends on deployment configuration:

- Authentication, project membership, and access policies
- Profile validation and the search filters your application relies on
- FHIR operations and terminology services
- Deployed Bot execution, subscriptions, and external integrations

Mock behavior changes with package versions. Keep the mock, SDK, and FHIR types on matching Medplum versions, and check the test-project cases below before deploying.

{{< /warning >}}

### Create test data

Most tests require setting up some resources in the mock environment before running the Bot. You can use `createResource()` and `updateResource()` to add resources to your mock server, just as you would with a regular `MedplumClient` instance.

The [finalize-report bot](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/finalize-reports.test.ts) from [Medplum Demo Bots](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/) provides a good example. Each test sets up a [Patient](/docs/api/fhir/resources/patient), an [Observation](/docs/api/fhir/resources/observation), and a [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport) before invoking the bot.

<details>
  <summary>Example: Create Resources</summary>
  {{< code-example file="examples/medplum-demo-bots/src/finalize-reports.test.ts" language="ts" blocks="create-resources" >}}
</details>

#### Creating Rich Test Data in Batches

Creating individual test resources can be time consuming and tedious, so the `MockClient` also offers the ability to use batch requests to set up sample data. See the [FHIR Batch Requests guide](/docs/fhir-datastore/fhir-batch-requests) for more details on batch requests.

Use `MockClient.executeBatch()` to load the resources, and inspect the entry results to confirm that setup succeeded. It accepts the same Bundle input as `MedplumClient.executeBatch()`; server-dependent behavior still needs a test project.

The below example is from the [find matching patients bot tests](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/deduplication/find-matching-patients.test.ts). Additionally, you can view the [patient data here](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/deduplication/patient-data.json).

<details>
  <summary>Example: Creating a large set of patient data with a batch request</summary>
  {{< code-example file="examples/medplum-demo-bots/src/deduplication/find-matching-patients.test.ts" language="ts" blocks="importPatientData,createBatchData" >}}
</details>

The example creates a fresh `MockClient` and loads its test data in `beforeEach`. This gives each test an independent starting state and keeps setup out of the assertions.

Once you have created your data, you can write your tests. The above example uses test contexts, a feature of the [Vitest test framework](https://vitest.dev/guide/test-context.html#test-context). It allows you to pass in the MockClient `medplum` as part of your test context. This test is checking that a `RiskAssessment` was created when looking for potential duplicate patients.

#### Using the Medplum CLI

If you have a dev project that already has rich data, you can use the Medplum CLI to easily convert this data into test data.

The Medplum CLI offers the optional `--as-transaction` flag when using the `medplum get` command. A `GET` request returns a `Bundle` with `type=searchset`, but this flag will convert it to `type=transaction`.

<details>
  <summary>Example: Get a patient and all encounters that reference them as a transaction</summary>
  {{< code-example file="packages/examples/src/bots/unit-testing-bots.ts" language="ts" blocks="cliAsTransaction" >}}
</details>

This example searches for all `Patient` resources named 'Alex'. It also uses the [`_revinclude` parameter](/docs/search/includes) to search for all `Encounter` resources that reference those patients.

A transaction `Bundle` can be used directly in a batch request, and can be passed as an argument to `executeBatch` on your `MockClient`. This allows you to easily create test resources from already existing data.

#### Cloning an Existing Project

If you want to clone an existing project into a new environment, you can use the `$clone` operation. For more details [see the Projects guide](/docs/access/projects#cloning-and-expunging-projects).

### Invoke your Bot

After setting up your mock resources, you can invoke your bot by calling your bot's handler function. See the ["Bot Basics" tutorial](/docs/bots/bot-basics#editing-a-bot) for more information about the arguments to `handler`

{{< code-example file="examples/medplum-demo-bots/src/finalize-reports.test.ts" language="ts" blocks="invoke-bot" >}}

### Query the results

Most of the time, Bots will create or modify resources on the Medplum server. To test your bot, you can use your `MockClient` to query the state of resources on the server, just as you would with a `MedplumClient` in production.

To check the bot's response, simply check the return value of your `handler` function.

After running the Bot, the [finalize-report bot's tests](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/finalize-reports.test.ts) read the updated `DiagnosticReport` and `Observation` resources to confirm their status.

<details>
  <summary>Example: Query the results</summary>
  {{< code-example file="examples/medplum-demo-bots/src/finalize-reports.test.ts" language="ts" blocks="query-results" >}}
</details>

{{< note title="A note on idempotency" >}}
To check [idempotency](https://en.wikipedia.org/wiki/Idempotence#Computer_science_meaning), call the handler twice with the same logical input and assert that the second call produces no duplicate effects. For this example, spies verify that the second call performs no additional resource writes. For a Bot that calls an external service, also assert its request count and idempotency key.

<details>
  <summary>Example: Idempotency test</summary>
  {{< code-example file="examples/medplum-demo-bots/src/finalize-reports.test.ts" language="ts" blocks="test-idempotent" >}}
</details>

{{< /note >}}

## Verify behavior on a test project

A passing mock test establishes the handler's behavior for the supplied inputs. Before deploying, verify these server-dependent behaviors in an isolated project with synthetic data:

- Execute the deployed Bot with the intended caller and Bot membership policies. Check both permitted and denied access.
- Trigger the actual Subscription or custom operation and verify the input shape and execution identity.
- Replay the same event and confirm that conditional writes and external-delivery tracking prevent duplicate effects.
- Exercise failure recovery and inspect the resulting AuditEvents or logs.
- Validate generated resources against the resolvable profiles used by the application.

See [Bots in Production](/docs/bots/bots-in-production), [Run as User](/docs/bots/bot-run-as-user), and [Subscriptions](/docs/subscriptions) for deployment, execution identity, and delivery semantics.
