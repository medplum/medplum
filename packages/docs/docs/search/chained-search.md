import ExampleCode from '!!raw-loader!@site/..//examples/src/search/advanced-search-parameters.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Chaining Searches

Chained search and reverse-chained search allow you to filter your searches based on the parameters of a referenced resource. This can reduce what might otherwise be a series of searches into just a single action.

Chained searches are similar to using `_include` or `_revinclude` parameters, but it will not return the referenced resources, only filter based on their parameters.

## Chained Search

Chained search allows you to filter your results based on the search parameters of a referenced resource. This is done by appending the resource type you are chaining after a `:`. Then, a `.` is appended with a search parameter of the chained resource.

<details><summary>Example: Search for any observations about a patient with the name 'homer'</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="chainedSearchTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="chainedSearchCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="chainedSearchCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

## Reverse Chained Search

Reverse chained searches allow you to filter your results based on other resources that reference your results. This is done using the `_has` parameter.

For example, you may want to search for any `Patient` resources that have had a certain code of an `Observation` made about them.

<details><summary>Example: Search for any Patients that have had carbon dioxide observed in their blood</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="reverseChainedSearchTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="reverseChainedSearchCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="reverseChainedSearchCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

In the above example `_has:Observation` filters for `Patient` resources that have an `Observation`. The `:patient` filters for `Observation` resources that reference a `patient` in the subject field. This is based on the `Observation` resource's `patient` search parameter. Finally, `:code=11557-6` filters for that specific code on the `Observation`.

Reversed chained searches also allow you to to perform an "or" search by including multiple arguments as a comma separated list.

<details><summary>Example: Search for any Patients that have had one of multiple observations</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="reverseChainedOrSearchTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="reverseChainedOrSearchCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="reverseChainedOrSearchCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

### Nesting reverse chained searches

It is also possible to nest the `_has` parameter.

In this example we search for a `Speicmen` that is referenced by a `DiagnosticReport` that originated from a `Procedure` on the date of `2023-11-12`.

<details><summary>Example: Nested reversed chained search</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="nestedReverseChainTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="nestedReverseChainCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="nestedReverseChainCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>
