# Unit Testing Bots

Because Bots are such a powerful automation and integration tool, unit testing your Bot code is crucial to ensuring accurate data and workflows. 

Medplum provides tools to help unit testing Bots on your local machine, most important of which is the  [`MockClient`](#) class. This guide will go over the most common unit testing patterns. 

You can also see a reference implementation of simple bots *with tests* in our [Medplum Demo Bots](https://github.com/medplum/medplum-demo-bots) repo.

## Set up your test framework

The first step is to set up your test framwork in your Bots package. Medplum Bots will should work with typescript/javascript test runner, and the Medplum team has tested bots with both [jest](https://jestjs.io/docs/expect) and [vitest](https://vitest.dev/). Follow the instructions for your favorite framework to set up you package - no additional steps needed!

Our [Medplum Demo Bots](https://github.com/medplum/medplum-demo-bots) repo also contains [eslint](#), [tsconfig](#), and [vite.config](#) settings that we recommend for a faster feedback cycle

## Write your test file

After setting up your framework,  you're ready to write your first test file! The most common convention is to create a single test file per bot, named `<botname>.test.ts`. 

You will need to import your bot's handler function, in addition to the other imports required by your test framework. You'll call this handler from each one of your tests. 

```typescript
import { handler } from './my-bot';
```

## Write your unit test

Most bot unit tests follow a common pattern: 

1. Create a Medplum `MockClient`
2. Create mock resources
3. Call the handler function
4. Read mock resources and assert test your test criteria



### Create a `MockClient`

The medplum MockClient class extends the MedplumClient class, but stores created resources in local memory rather than persisting them to the server. This presents an API and type-compatible interface to the Bot's handler function, which makes it ideal for unit tests.

```
const medplum = new MockClient();
```



We recommend creating a `MockClient` at the beginning of each test, to avoid any cross-talk between tests

::: warning Caution

The MockClient does not yet *perfectly* replicate the functionality of the `MedplumClient` class, as this would require duplicating the entire server codebase. Some advanced functionality does not yet behave the same between `MockClient` and `MedplumClient`, including: 

- `medplum.graphql`
- `medplum.patchResource`
- `medplum.executeBatch`

The Medplum team is working on bringing these features to parity as soon as possible. You can join our Github discussion [here](#)

::: 

### Create mock resource resources

Most tests require setting up some resources in the mock environment before running the Bot. You can use `createResource()` and update 



TODO:  finalize report bot

The [patient intake test](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/patient-intake.test.ts) from [Medplum Demo Bots](https://github.com/medplum/medplum-demo-bots/) provides a good example.



----



Outline:

* Set a jest / vittest repo

* Import your handler function

* For each test

  * Create a mock client
  * Create mock resources
  * Call your handler function
  * Use the mock client to query results

  