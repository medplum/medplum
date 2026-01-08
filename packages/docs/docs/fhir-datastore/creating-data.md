---
id: creating-data
sidebar_position: 1
toc_max_heading_level: 4
---

import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/fhir-datastore/creating-data.ts';

# Creating Data

Data is created in FHIR by using the `create` operation, which is performed by sending a `POST` request to the server.

Medplum also provides the `createResource` method on the `MedplumClient` which implements the `create` operation. When creating a resource, you do not need to provide an `id`, as it will be assigned by the server.

<details>
  <summary>Example: Creating a Practitioner</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="createTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="createCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="createCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>
