import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/fhir-datastore/fhir-batch-requests.ts';

# FHIR Batch Requests

FHIR allows users to create batch requests to bundle multiple interactions into a single HTTP request. Batch requests can improve speed and efficiency and can reduce HTTP traffic when working with many resources.

## How to Perform a Batch Request

Batch requests are performed by making an HTTP POST request. The content of the request should be a [`Bundle`](/docs/api/fhir/resources/bundle) resource with the `Bundle.type` field set to `batch`.

Setting the `type` field to `batch` defines some rules for how the request is processed. A batch request is an _ordered_ sequence of REST calls, in which there are no interdependencies between the entries. Each entry is processed separately, as if it were an individual interaction, so one action failing will not have any effect on the other actions.

The details of your request will be in the `entry` field of the `Bundle`, which is an array of `BundleEntry` objects. Each `BundleEntry` should have the details of the resource you are working with, as well as additional information about the request you are making, which will be in the `request` field. Here you can define the `method` and `url` to be used when making the request.

Once you have created your `Bundle`, it should be sent as the content of an HTTP request with a POST method. Alternatively, you can use the `executeBatch` helper function provided by the Medplum SDK, with your `Bundle` as an argument.

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="simpleBatchTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="simpleBatchCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="simpleBatchCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details><summary>Example: Create a resource and update it in the same batch request</summary>
  <MedplumCodeBlock language="ts" selectBlocks="createThenUpdate">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

### The \_history Endpoint

The `_history` endpoint allows you to retrieve the full history of a resource, resource type, or all resources on a system. You can use a batch request to make multiple simultaneous calls to the history endpoint, getting the history of multiple resources or resource types at once.

<details><summary>Example: Making multiple calls to the _history endpoint in one batch request</summary>
  <MedplumCodeBlock language="ts" selectBlocks="historyEndpoint">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Creating Internal References

A common workflow when using batch requests is creating a resource that references another resource that is being created in the same batch. For example, you may create a `Patient` resource that is the `subject` of an `Encounter` created in the same batch request.

Creating internal references can be easily done using the `urn:uuid` syntax and the `fullUrl` field on a `Bundle.entry` element. The `fullUrl` represents the absolute URL for the resource and should match with the `id` of that resource.

To use this syntax set the `fullUrl` field to a string of `'urn:uuid'` followed by the a `urn:uuid`. If you are creating a resource, you should generate a random `uuid` to use for this field. This string can then be used as a reference in other resources.

<details><summary>Example: Creating a patient and encounter whose subject is the created patient</summary>
  <MedplumCodeBlock language="ts" selectBlocks="internalReference">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Conditional Batch Actions

There may be situations where you are creating a resource as a part of a batch request, but are unsure whether it already exists. In these cases, you can conditionally perform batch actions by adding the `ifNoneExist` property to the `request` element of your `Bundle`. This is an important tool to avoid duplicating resources for the same record.

The `ifNoneExist` property uses [search parameters](/docs/search/basic-search#search-parameters) to search existing resources and only performs the action if no match is found. Since you are already defining the `url` to send the request to, you only need to enter the actual parameter in this field (i.e., everything that would come after the `?` when submitting an actual search).

<details><summary>Example: Create a patient and organization, only if the organization does not already exist</summary>
  <MedplumCodeBlock language="ts" selectBlocks="conditionalCreate">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Medplum Autobatching

Medplum provides the option to automatically batch HTTP requests using the `autoBatchTime` element on the Medplum client. This field allows you to set a timer that delays executing any HTTP requests. During this delay, if any additional HTTP requests come through, Medplum will add them to a `Bundle` behind the scenes and then execute them as a batch request.

Autobatching works by creating a queue of each `Promise` that is issued in the `autoBatchTime` window and then creating a bundle out of these requests. To allow the queue to be created, you must make sure that the main thread continues to run, so you should not use `await`. Using `await` will pause the main thread each time a request is made, so a queue cannot be created.

Instead you should create the queue of `Promise` requests and then use `Promise.all()` to resolve all of them at once.

<details><summary>Example: Await pauses the thread, not allowing a bundle to be created for a batch request</summary>
  <MedplumCodeBlock language="ts" selectBlocks="awaitPromise">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details><summary>Example: The promises are queued so the main thread can continue. They are able to be added to a bundle and executed in a batch when they are simultaneously resolved</summary>
  <MedplumCodeBlock language="ts" selectBlocks="resolveAll">
    {ExampleCode}
  </MedplumCodeBlock>
</details>
