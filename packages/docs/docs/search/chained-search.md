import ExampleCode from '!!raw-loader!@site/..//examples/src/search/chained-search.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Chaining Searches

Chaining search parameters allows you to filter your searches based on the parameters of another resource which is related to the target resource through one or more references. This can reduce what might otherwise be a series of searches into just a single action.

Chained searches are similar to using [`_include` or `_revinclude` parameters](/docs/search/includes), but it will not return the referenced resources, only filter based on their parameters. The primary benefit of this is it allows for easy pagination since you know you will only receive results of one resource type. See the [paginated search docs](/docs/search/paginated-search) for more details.

:::note Chained Search Availability

Chained search is only available when using the FHIR Rest API as described here. If you are using GraphQL, chained search functionality is not supported.

:::

## Forward Chained Search

[Search parameters](/docs/search/basic-search) with the `reference` type can be chained together to search on the elements of the referenced resource.

In the below example we search for all [`Observation`](/docs/api/fhir/resources/observation) resources that are linked to a [`Patient`](/docs/api/fhir/resources/patient) with the name of 'homer' using the syntax `patient.name=homer`. The way to read this is "search for all [`Observation`](/docs/api/fhir/resources/observation) resources that reference a [`Patient`](/docs/api/fhir/resources/patient) (using the `patient` search parameter) and has a name of 'homer'.

<details>
  <summary>Example: Search for any [`Observations`](/docs/api/fhir/resources/observation) about a [`Patient`](/docs/api/fhir/resources/patient) with the name 'homer'</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="simpleChainedSearchTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="simpleChainedSearchCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="simpleChainedSearchCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

The target resource for every link in the chain must be unambiguous. If a search parameter can reference multiple resource types, you must specify the resource type in your search.

Just like the example above, the below example searches for all [`Observation`](/docs/api/fhir/resources/observation) resources linked to a [`Patient`](/docs/api/fhir/resources/patient) with a name of 'homer', this time using the syntax `subject:Patient.name=homer`. The way to read this is "search for all [`Observation`](/docs/api/fhir/resources/observation) resources whose `subject` parameter is of type [`Patient`](/docs/api/fhir/resources/patient) and has a name 'homer'".

In the above example, the `patient` parameter can only search for [`Patient`](/docs/api/fhir/resources/patient) resources, so it was not necessary to explicitly state which resource type we were searching for.

The general syntax for a forward chained search is `<reference searchParam>:<referenced resource type>.<referenced resource searchParam>=<value>`.

<details>
  <summary>Example: Search for any [`Observations`](/docs/api/fhir/resources/observation) about a subject that is a [`Patient`](/docs/api/fhir/resources/patient) with the name 'homer'</summary>
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

You can include more than one link in your chained search. In the below example, we search for [`Observation`](/docs/api/fhir/resources/observation) resources that are linked to an [`Encounter`](/docs/api/fhir/resources/encounter) done by a service-provider with the name of 'Kaiser'.

<details>
  <summary>Example: A chained search that chains multiple parameters</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="multipleChainsTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="multipleChainsCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="multipleChainsCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>

:::note Filtering Chained Searches

The [`_filter` search parameter](/docs/search/filter-search-parameter) is not currently supported when using chained search. This is on the Medplum road map, but there is no firm date when it is expected to be implemented. You can follow [this issue](https://github.com/medplum/medplum/issues/3224) for updates.

:::

## Reverse Chained Search

Chained references can also be constructed in reverse, filtering on other resources that reference your target search resource. This is done using the `_has` parameter, which has a special syntax: `_has:<next resource type>:<link parameter>:<next parameter>`.

For example, `Patient?_has:Observation:subject:status=preliminary` would select [`Patient`](/docs/api/fhir/resources/patient) resources that have an [`Observation`](/docs/api/fhir/resources/observation) pointing to them as the `subject` and are also in preliminary status.

:::tip Resource Type Ambiguity
For reverse chaining, the referenced type of the link parameter is never ambiguous: the previous resource type in the chain is used.
:::

As another example, you may want to search for any [`Patient`](/docs/api/fhir/resources/patient) resources with a heart rate above 150 ([Loinc Code 8867-4](https://loinc.org/8867-4)) [`Observation`](/docs/api/fhir/resources/observation) made about them.

<details>
  <summary>Example: Search for any [`Patients`](/docs/api/fhir/resources/patient) that have had an observed heart rate above 150</summary>
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

In the above example `_has:Observation` filters for [`Patient`](/docs/api/fhir/resources/patient) resources that have an [`Observation`](/docs/api/fhir/resources/observation). The `:subject` filters for [`Observation`](/docs/api/fhir/resources/observation) resources that reference a [`Patient`](/docs/api/fhir/resources/patient) in the subject field. This is based on our initial search for a [`Patient`](/docs/api/fhir/resources/patient). Finally, `:code=11557-6` filters for that specific code on the [`Observation`](/docs/api/fhir/resources/observation).

### Nesting reverse chained searches

It is also possible to nest the `_has` parameter.

In this example we search for a [`Specimen`](/docs/api/fhir/resources/specimen) that is referenced by a [`DiagnosticReport`](/docs/api/fhir/resources/diagnosticreport) that originated from a [`Procedure`](/docs/api/fhir/resources/procedure) on the date of `2023-11-12`.

<details>
  <summary>Example: Nested reversed chained search</summary>
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

### Combining forward and reverse chained search

You can mix and match chained parameters by combining a forward chained search with the `_has` parameter.

In the below example, we search for a [`Patient`](/docs/api/fhir/resources/patient) with an [`Observation`](/docs/api/fhir/resources/observation) that was performed by a [`CareTeam`](/docs/api/fhir/resources/careteam) that has a member with the name of 'bob'.

<details>
  <summary>Example: Combining reverse and forward chained search</summary>
  <Tabs groupId="language">
    <TabItem value="ts" label="Typescript">
      <MedplumCodeBlock language="ts" selectBlocks="combinedChainTs">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="cli" label="CLI">
      <MedplumCodeBlock language="bash" selectBlocks="combinedChainCli">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
    <TabItem value="curl" label="cURL">
      <MedplumCodeBlock language="bash" selectBlocks="combinedChainCurl">
        {ExampleCode}
      </MedplumCodeBlock>
    </TabItem>
  </Tabs>
</details>
