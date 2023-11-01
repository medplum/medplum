import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/fhir-datastore/fhir-batch-requests.ts';

# FHIR Batch Requests

FHIR allows users to create batch requests to bundle multiple API calls into a single HTTP request. Batch requests can improve speed and efficiency and can reduce HTTP traffic when working with many resources.

## How to Perform a Batch Request

Batch requests are modeled using the `Bundle` resource by setting `Bundle.type` to `"batch"`.

Batch requests are performed by sending a POST request to `[baseURL]/` with a FHIR Bundle. The Medplum SDK provides the `executeBatch` helper function to simplify this operation.

The details of your request will be in the `entry` field of the `Bundle`, which is an array of `BundleEntry` objects. Each `BundleEntry` should have the details of the resource you are working with, as well as additional information about the request you are making.

| Element               | Description                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request.url`         | The URL to send your request to. This is relative to the base R4 FHIR URL (e.g. https://api.medplum.com/fhir/R4).                                                                                                            |
| `request.method`      | The type of HTTP request you are making. Can be one of the following: <ul><li>GET: Read a resource or perform a search</li><li>POST: Create a resource</li><li>PUT: Update a resource</li><li>DELETE: Delete a resource</li></ul> |
| `request.ifNoneExist` | [See below](#conditional-batch-actions)                                                                                                                                                                                      |
| `resource`            | The details of the FHIR resource that is being created/updated.                                                                                                                                                              |
| `fullUrl`             | [See below](#creating-internal-references)                                                                                                                                                                                   |

<details><summary>Example: A simple batch request to simultaneously search for two patients</summary>
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
</details>

<details><summary>Example: Create multiple resources in one batch request</summary>
  <MedplumCodeBlock language="ts" selectBlocks="batchCreate">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details><summary>Example: Make multiple calls to the _history endpoint in one batch request</summary>
  <MedplumCodeBlock language="ts" selectBlocks="historyEndpoint">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Creating Internal References

A common workflow when using batch requests is creating a resource that references another resource that is being created in the same batch. For example, you may create a `Patient` resource that is the `subject` of an `Encounter` created in the same batch request.

Creating internal references is done by assigning temporary ids to each bundle entry. The `fullUrl` field is set to `'urn:uuid:'` followed by a temporary UUID.

Future bundle entries can refer to this resource using the temporary `urn:uuid`.

:::caution Note
Batches are processed in order, so resources must be created in your bundle prior to being referenced. To assist with this, you can use the [reorderBundle](docs/sdk/modules#reorderBundle) helper function, which performs a topological sort to reorder bundle entries such that a resource is created _before_ references to that resource appear in the bundle.
:::

<details><summary>Example: Create a patient and encounter whose subject is the created patient</summary>
  <MedplumCodeBlock language="ts" selectBlocks="internalReference">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details><summary>Example: Create a patient and update it in the same batch request</summary>
  <MedplumCodeBlock language="ts" selectBlocks="createThenUpdate">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Conditional Batch Actions

There may be situations where you would only like to create a a resource as part of a batch request if it does not already exist.

You can conditionally perform batch actions by adding the `ifNoneExist` property to the `request` element of your `Bundle`.

The `ifNoneExist` property uses [search parameters](/docs/search/basic-search#search-parameters) to search existing resources and only performs the action if no match is found. Since you are already defining the `url` to send the request to, you only need to enter the actual parameter in this field (i.e., everything that would come after the `?` when submitting an actual search).

<details><summary>Example: Create a patient and organization, only if the organization does not already exist</summary>
  <MedplumCodeBlock language="ts" selectBlocks="conditionalCreate">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Medplum Autobatching

The Medplum Client provides the option to automatically batch HTTP requests using the `autoBatchTime` parameter. This field allows you to set a timer that delays executing any HTTP requests. During this delay, if any additional HTTP requests come through, Medplum will add them to a `Bundle` behind the scenes and then execute them as a batch request.

Autobatching works by creating a queue of `Promises` issued within the `autoBatchTime` window and then creating a bundle out of these requests.

To allow the queue to be created, you must make sure that the main thread continues to run, so you should not use `await` after each request. Using `await` will pause the main thread each time a request is made, so a queue cannot be created.

Instead you should create the queue of `Promise` requests and then use `Promise.all()` to resolve all of them at once.

<details><summary>Resolving Promises with autobatching</summary>
  ❌ WRONG
  <MedplumCodeBlock language="ts" selectBlocks="autobatchingWrong">
    {ExampleCode}
  </MedplumCodeBlock>
  ✅ CORRECT
  <MedplumCodeBlock language="ts" selectBlocks="autobatchingCorrect">
    {ExampleCode}
  </MedplumCodeBlock>
</details>
