---
id: updating-data
toc_max_heading_level: 5
sidebar_position: 3
---

import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/fhir-datastore/updating-data.ts';

# Updating Data

Medplum offers three FHIR operations that can be used to update data:

- `update`
- `upsert`
- `patch`

While all of these will update your data, they do so in different ways. The `update` operation replaces the entire resource, an `upsert` replaces the entire resource but creates it if it is not found, and the `patch` operation updates only the specific element(s) you requested.

## Update Operation

Using the `update` operation performs a `PUT` command, which will create an entirely new version of your resource, rewriting every element. When sending an update request you must include the `resourceType` and the `id` of the resource you are updating, as well as the updated resource itself in the body of the request.

Medplum provides the `updateResource` method on the `MedplumClient` which implements the `update` operation. The function takes the updated resource as an argument.

The below example updates a [`Patient`](/docs/api/fhir/resources/patient) resource to include a `name`.

<details>
<summary>Example: Updating a Resource</summary>
<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="updateTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="updateCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="updateCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>
</details>

## Upsert Operation

The `upsert` operation also performs a `PUT` command, to update your entire resource. However, instead of taking the `id`, it allows you to use [FHIR Search Parameters](/docs/search/basic-search#search-parameters) to find the resource you want to update. Additionally, if it cannot find a match, it will create the resource sent to the server.

Medplum provides the `upsertResource` method on the `MedplumClient`, which implements the `upsert` operation. The function takes a `resource` and a search query to find the resource to be updated.

The below operation searches for a patient to add a name to, and creates it if it cannot be found.

<details>
<summary>Example: Upserting a Resource</summary>
<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="upsertTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="upsertCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="upsertCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>
</details>

## Patch Operation

The `patch` operation performs a `PATCH` command, which updates only the specified elements in your resource. When sending a `patch` operation, you must include the `resourceType` and the `id` of the resource, as well as the patch body, containing the operation, path, and value.

Medplum provides the `patchResource` method on the `MedplumClient` which implements the `patch` operation. The function takes the `resourceType`, `id`, and an array of `PatchOperations`. A `PatchOperation` details the updates that will be made to your resource, and has three required fields: `op`, `path`, and `value`. The `op` is the actual operation that will be performed, the `path` is the path to the element on the resource that is being updated, and the `value` is the new value for the element at the given path.

The `PatchOperation` below sends an `add` operation to the `name` of the [`Patient`](/docs/api/fhir/resources/patient) with our newly created name. The `add` operation can be used even if the patient already has a name, as it will replace any value it finds at the given path.

<details>
<summary>Example: Patching a Resource</summary>
<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="patchTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="patchCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="patchCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>
</details>

:::note Preventing Race Conditions
In the TypeScript patch example, a second `PatchOperation` is included: `{ op: 'test', path: '/meta/versionId', value: existingPatient.meta?.versionId }`. This is a test to prevent race conditions. This will cause the `patch` to fail if the resource on the server has a different `versionId` than the one you are sending. **It is strongly recommended to include this test on all `patch` operations.**
:::
