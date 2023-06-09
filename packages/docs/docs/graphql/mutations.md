---
sidebar_position: 3
---

import ExampleCode from '!!raw-loader!@site/../examples/src/graphql/mutations.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Mutations

GraphQL mutations are operations that allow the client to create, update, or delete data on the server. Unlike queries, which are read-only operations and can be executed in parallel, mutations are write operations. 

For the inputs, you would append the action (Create, Update, or Delete) to the resource type. Here are examples of mutations for the `Patient` resource:

### Create Mutation
<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationCreatePatientGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationCreatePatient">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="MutationCreateResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

### Put Mutation
<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationPatientUpdateGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationPatientUpdateTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="MutationUpdateResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

### Delete Mutation
<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationPatientDeleteGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationPatientDeleteTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>