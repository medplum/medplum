import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/search/advanced-search-parameters.ts';

# Advanced Search Parameters

The FHIR search framework allows for special search parameters that enable more complex searches to fine-tune your results. In this document, we will go over the following special parameters:

- [\_id](#id)
- [\_lastUpdated](#lastupdated)
- [\_summary](#summary)
- [\_elements](#elements)
- [\_tag](#tag)
- [\_compartment](#compartment)
- [\_total](#total)
- [\_profile](#profile)
- [\_filter](#filter)
- [\_sort](#sort)

## \_id

The `_id` parameter allows you to search for any resource based on its `id` field.

<details><summary>Example: Searching for a patient by _id</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="idTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="idCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="idCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## \_lastUpdated

The `_lastUpdated` parameter allows you to search for resources based on when they were most recently changed.

This is especially useful when combined with comparision operators, such as `gt` (greater than) or `lt` (less than) to find resources that have or have not been changed since a certain time or date.

<details><summary>Example: Searching for only communications that have occurred since the beginning of October, 2023</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="lastUpdatedTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="lastUpdatedCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="lastUpdatedCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## \_summary

The `_summary` parameter allows you to return only a portion of a resources elements. Its primary intent is to optimize your queries by fetching only essential information. It is particularly useful when searching for large resources such as those with images or repeating elements.

The `_summary` parameter can contain one of the following value set:

| Value   | Description                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| `true`  | Only returns elements that are marked as `summary` in the resource definition.                                     |
| `text`  | Returns the `text`, `id`, and `meta` elements, along with any top-level mandatory elements for the given resource. |
| `data`  | Returns the `id`, `meta`, and any top-level mandatory elements for the given resource.                             |
| `count` | Returns the count of matching resources, but none of the actual resource details for those matches.                |
| `false` | Returns all of the elements for the resource. It does not return a summary.                                        |

<details><summary>Example: Searching for a summary of a patient</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="summaryTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="summaryCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="summaryCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

<details><summary>Example Response</summary>
  <MedplumCodeBlock language="bash" selectBlocks="summaryResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## \_elements

The `_elements` parameter is similar to `_summary` in that it allows you to return only a subset of the resource's elements. However, rather than a predefined value set, `_elements` allows you to choose which fields you would like to return.

The fields you choose should be formatted as a comma-separated list of base elements for a given resource.

Note that any top-level mandatory or modifier elements should always be included in the chosen list of elements. Additionally, servers are not obligated to return only the elements requested and should always return all mandatory elements.

<details><summary>Example: Searching the subject and performers of observations</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="elementsTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="elementsCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="elementsCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

<details><summary>Example Response</summary>
  <MedplumCodeBlock language="bash" selectBlocks="elementsResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## \_tag

The `_tag` parameter allows you to search on the `tag` field of the `meta` element of the resource you are searching for. The `tag` field contains user-defined tags to categorize the resource.

<details><summary>Example: Searching for observations that are tagged as critical</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="tagTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="tagCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="tagCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## \_compartment

A compartment is a grouping of resources which share a common relation. For example, each `Patient` resource has its own compartment. A `Patient` compartment includes any resources which reference that `Patient`, usually in the `subject` field.

Medplum allows you to easily search using compartments by providing the non-standard `_compartment` parameter. This enables you to find all resources of a given type that are associated with a certain compartment.

Using `_compartment` can be especially helpful when searching for `Communication` resources by or about a `Patient`. `Communication` resources are part of a compartment if the patient is the `sender`, `recipient`, or `subject` of the message. Searching by compartments allows you to handle all of these in one search, rather than splitting it into three searches or using a complex filter expression.

<details><summary>Example: Find all communications for a patient</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="compartmentTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="compartmentCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="compartmentCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## \_total

When you search using FHIR, the server returns a `Bundle`, not the actual resources that you searched for. A `Bundle` contains a `total` element, which inddicates the total number of resources that match your search parameters.

Since providing the exact number of matching resources can be onerous on the server, the `_total` parameter is provided to assist with this. If you do not include the `_total` parameter, the `total` field will not be populated. There are three options that you can provide for the `_total` parameter:

| Value    | Description                                                                           |
| -------- | ------------------------------------------------------------------------------------- |
| accurate | The response `Bundle` will have the exact number of matching resources.               |
| estimate | The response `Bundle` will have a rough estimate of the number of matching resources. |
| none     | The `total` field will not be populated on the response `Bundle`.                     |

:::note Note
The Medplum SDK provides the `searchResources` helper function. This function unwraps the response bundle of your search results and returns an array of the resources that match your parameters. Since you will not receive a bundle, the `_total` parameter is not relevant when using this function.
:::

<details><summary>Example: Search for all patients in your organization and get an estimate of the total number</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="totalTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="totalCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="totalCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## \_profile

FHIR allows [profiling](http://hl7.org/fhir/R4/profiling.html) to create custom data structures that specify how resources should be structured and constrained to meet specific use cases. The `_profile` parameter allows you to search based on these profiles.

The `_profile` parameter is a reference parameter, meaning you may provide a reference as an argument to the parameter.

<details><summary>Example: Search for observations that are part of the pediatric growth charts profile</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="profileTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="profileCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="profileCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## \_filter

The `_filter` parameter can be used to filter for more complex queries. For more details see the [\_filter Search Parameter docs](/docs/search/filter-search-parameter).

## \_sort

The `_sort` parameter allows you to sort the results of your search based on different parameters. For details on how to use the `_sort` parameter, see the [Sorting the Results docs](/docs/search/basic-search#sorting-the-results).
