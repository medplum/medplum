---
sidebar_position: 3
---

import ExampleCode from '!!raw-loader!@site/../examples/src/graphql/mutations.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Mutations

GraphQL mutations are operations that allow the client to create, update, or delete data on the server. Unlike queries, which are read-only operations and can be executed in parallel, mutations are write operations. For more information about GraphQL mutations, refer to the [GraphQL documentation](https://graphql.org/learn/queries/#mutations).

Medplum implements the draft [FHIR GraphQL Mutation spec](https://hl7.org/fhir/R4/graphql.html#mutations). For the inputs, you would append the action (Create, Update, or Delete) to the resource type.

Here are examples of mutations for the `Patient` resource. You can test these mutations at [graphiql.medplum.com](https://graphiql.medplum.com/)

## Create Mutation

You can create a resource using the `[resourceType]Create` mutation.

To create a [`Patient`](/docs/api/fhir/resources/patient):

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationCreatePatientGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="MutationCreatePatient">
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

### Aliasing the output

Just as with GraphQL queries, you can alias the newly created resource.

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationCreatePatientGraphQLAliased">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="MutationCreatePatientAliased">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="MutationCreateResponseAliased">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

### Built-in types

Medplum's graphQL schema provides type definitions for complex nested fields (aka "[Backbone Elements](https://www.hl7.org/fhir/R4/backboneelement.html#BackboneElement)"). These can be used to simplify arguments to your custom mutations.

This examples demonstrates how to create a mutation that creates a [`Communication`](/docs/api/fhir/resources/communication) resource and takes an array of `CommunicationPayload` types as a parameter:

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationCreateCommunicationGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="MutationCreateCommunication">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

## Update Mutation

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationPatientUpdateGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="MutationPatientUpdateTS">
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

## Delete Mutation

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="MutationPatientDeleteGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="MutationPatientDeleteTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>
