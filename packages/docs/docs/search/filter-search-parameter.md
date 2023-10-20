---
sidebar_position: 3
---

import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/search/filter-search-parameter.ts';

# The `_filter` Search Parameter

The `_filter` parameter extends FHIR's search functionality by allowing you to narrow down your results using complex filter expressions. It is a useful way to filter resources in a way that may not be easily achieveable using standard parameters.

## Filter Syntax

The syntax for the `_filter` parameter is different than for other search parameters. Rather than setting `_filter` equal to a value, you must set it equal to a filter expression using a comparison operator.

A filter expression has three parts: a **parameter**, an **operator**, and a **value**.

- The **parameter** is the [search parameter](/docs/search/basic-search#search-parameters) of the resource that you will filter by
- The **operator** is the type of comparison you will make [(see below)](#comparison-operators)
- The **value** is the criteria you want to compare against

<details><summary>Example: Filter syntax</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="syntaxTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="syntaxCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="syntaxCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

In this example, the filter expression is `name eq "simpson"`, where `name` is the **parameter**, `eq` is the **operator**, and `"simpson"` is the **value**.

## Comparison Operators

The `_filter` parameter has several operators that you can use to create your filter expressions. These are defined in the table below.

| Operation         | Value                                            | Description                                                                                                                                    | Example Expression                                                      |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| eq                | equals                                           | Filters for items that are equal to the value provided.                                                                                        | Patient: given eq "homer"                                               |
| ne                | does not equal                                   | Filters for items that are not equal to the value provided.                                                                                    | Patient: given ne "marge"                                               |
| co                | contains                                         | Filters for items that contain the value provided.                                                                                             | Pateint: name co "sim"                                                  |
| gt / lt / ge / le | greater/less than, greater/less than or equal to | Filters for items that are greater than (gt), less than (lt), greater than or equal to (ge), or less than or equal to (le) the value provided. | Patient: birthdate ge "1996-06-06" / Patient: birthdate le "1996-06-06" |
| sa                | starts after                                     | Filters for items that start after the value provided. Most useful when filtering for dates or time periods.                                   | Observation: date sa "2023-01-01"                                       |
| eb                | ends before                                      | Filters for items that end before the value provided. Most useful when filtering for dates or time periods.                                    | Observation: date eb "2023-08-01"                                       |
| pr                | property exists                                  | Filters for items that contain or do not contain the specified field. Can be set to either `true` or `false`.                                  | Observation: specimen pr false                                          |
| in                | in                                               | Filters for items that are within a provided value set.                                                                                        | DiagnosticReport: code in "http://loinc.org"                            |
| ni                | not in                                           | Filters for items that are not within a provided value set.                                                                                    | DiagnosticReport: code ni "http://loinc.org "                           |

## Logical Expressions

The `_filter` parameter allows you to apply multiple filters using logical operators such as "and", "or", and "not".

This example will return all male patients that have the string "sim" somewhere in their name.

<details><summary>Example: Filtering a serach based on both name and gender</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="logicalAndTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="logicalAndCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="logicalAndCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

This example will return any patients that have an identifier of 12345 OR the phone number "555-6789". It is important to note that this is _impossible_ to do using standard search parameter syntax.

<details><summary>Example: Filtering a serach based on either an identifier or phone number</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="logicalOrTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="logicalOrCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="logicalOrCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## Nested Filters

You can further refine your search by nesting filters using parentheses and logical operators.

<details><summary>Example: Filtering a search based on gender and two potential names</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="nestedTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="nestedCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="nestedCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

This example initially filters for all male patients. It then filters those male patients for any names that contain either of the strings "sim" or "wigg".
