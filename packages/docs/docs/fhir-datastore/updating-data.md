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

- `update`: Replaces the entire resource
- `upsert`: Replaces the entire resource and creates a new one if the specified resource is not found
- `patch`: Updates only the specific element(s) that are requested.

## Update Operation

The `update` operation is performed by sending a `PUT` request, which will create an entirely new version of your resource, rewriting every element. When sending an update request you must include the `resourceType` and the `id` of the resource you are updating, as well as the updated resource itself in the body of the request.

Medplum provides the `updateResource` method on the `MedplumClient` which implements the `update` operation. The function takes the updated resource as an argument.

The below example updates a [`Patient`](/docs/api/fhir/resources/patient) resource.

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

The `upsert` operation also sends a `PUT` request, updating your entire resource. However, instead of taking the `id`, it allows you to use a search query with [FHIR search parameters](/docs/search/basic-search#search-parameters) to find the resource you want to update.

- If the search query resolves to a single resource, that resource will be updated.
- If it does not find a matching resource, one will be created from the given data.
- If multiple matches are found, an error will be returned. In this case, more specific search criteria are required to unambiguously identify the resource to be updated or created.

Medplum provides the `upsertResource` method on the `MedplumClient`, which implements the `upsert` operation. The function takes a `resource` and a FHIR search query to find the resource to be updated.

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

### Preventing Lost Updates with Version Checking

When updating resources in a multi-user environment, it's important to prevent **lost updates** that can occur when multiple clients update the same resource concurrently. Without version checking, the last write wins, which can overwrite changes made by other users.

To prevent this, you can use the `If-Match` header (or `ifMatch` option) to specify the expected version of the resource. If the resource's current version doesn't match, the update will fail with a `412 Precondition Failed` error.

<details>
<summary>Example: Safe Update with Version Checking</summary>
<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="safeUpdateTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="safeUpdateCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>
</details>

**For transaction bundles**, you can use version checking with `ifMatch` in bundle entry requests. See the [Version Checking in Transaction Bundle](/docs/fhir-datastore/fhir-batch-requests#preventing-lost-updates-with-version-checking) section for details.


## Patch Operation

The `patch` operation is performed by sending an HTTP `PATCH` request, which updates only the specified elements in your resource. When sending a `patch` operation, you must include the `resourceType` and the `id` of the resource, as well as the patch body, containing the operation, path, and value.

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
In the TypeScript patch example, a second `PatchOperation` is included:

`{ op: 'test', path: '/meta/versionId', value: patient.meta?.versionId }`

This is a test to prevent race conditions. This will cause the `patch` to fail if the resource on the server has a different `versionId` than the one you are sending. **It is strongly recommended to include this test on all `patch` operations.**
:::
