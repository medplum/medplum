---
sidebar_position: 1
---

import ExampleCode from '!!raw-loader!@site/../examples/src/graphql/basic-query.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Basic Queries

## Overview

This guide will walk you through how to use the [FHIR GraphQL API](https://hl7.org/fhir/r4/graphql.html) with Medplum. Clinical data is often comprised of multiple FHIR resources, and the FHIR GraphQL API makes it easy to query multiple linked resources in a single request.

The GraphQL API also allows you to request specific elements, rather than full resources, which can be more efficient in bandwidth constrained settings.

To experiment with the API, you can use Medplum's interactive GraphQL environment at [graphiql.medplum.com](https://graphiql.medplum.com/). You can log in with your Medplum credentials, and run these example queries in the GraphiQL IDE.

## How to perform basic GraphQL queries

GraphQL queries allow you to request specific resourced fields. In a FHIR GraphQL query, you will use the resource type as the root, followed by the ID in parentheses. The requested fields are enclosed in curly braces.

For example, to request a `Patient` by ID:

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="GetPatientByIdGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="GetPatientByIdTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="GetPatientByIdCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="GetPatientByIdResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

This query retrieves the `resourceType`, `id`, `name`, and `address` of the specified `Patient`.

## How to perform FHIR searches with GraphQL

To perform a FHIR search, append the word `"List"` to the FHIR resource type. For example, to search for Patient resources use `"PatientList"`. You will specify search parameters as query parameters, similarly to [basic REST search](/docs/search/basic-search).

GraphQL also allows you to [alias returned fields](https://devinschulz.com/rename-fields-by-using-aliases-in-graphql/) to make the results more readable.

:::warning Warning

In FHIR GraphQL, the search parameter names use **snake_case** instead of the **kebab-case** commonly used in the FHIR REST API.

:::

To search for a list of `Patient` resources with a specific name and city:

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="SearchPatientsByNameAndCityGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="SearchPatientsByNameAndCityTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="SearchPatientsByNameAndCityCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="SearchPatientsByNameAndCityResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

This query searches for Patient resources with the name `"Eve"` and a city of `"Philadelphia"`, and aliases the list of patients as `patients` in the response.

See the "[Searching Resources](https://hl7.org/fhir/r4/graphql.html#searching)" section of the FHIR GraphQL specification for more information.

:::caution Search Modifiers

The [official FHIR GraphQL specification](https://hl7.org/fhir/R4/graphql.html) currently does not support [search modifiers](/docs/search/basic-search#search-modifiers) such as `:not`, `:missing`, and `:contains`. If you'd like to participate or learn more, join the discussion [here](https://chat.fhir.org/#narrow/stream/192326-graphql/topic/Search.20Modifiers.20in.20GraphQL/near/340283410).

:::

## Resolving nested resources with the `resource` element

Clinical data is often spread across multiple FHIR resources that reference each other. The FHIR GraphQL API contains a special `resource` element to resolve these references and retrieve the nested resources.

To resolve a reference, you need to use the GraphQL inline fragment syntax `(... on ResourceType)`. Inline fragments allow you to request fields on a specific type within a more general parent type. This is important for FHIR GraphQL queries because the resource field can return different types of resources depending on the reference.

For example, to retrieve a `DiagnosticReport` and all the `Observation` resources referenced by `DiagnosticReport.result`:

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="DiagnosticReportWithObservationsGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="DiagnosticReportWithObservationsTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="DiagnosticReportWithObservationsCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="DiagnosticReportWithObservationsResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

This query retrieves a `DiagnosticReport` and the `Observation` resources associated with it.

See the "[Resource References](https://hl7.org/fhir/r4/graphql.html#references)" section of the FHIR GraphQL specification for more information.

## Searching reverse references using the `_reference` keyword

FHIR GraphQL also supports reverse-reference searches, which allow you to find resources that _point to_ the current resource.

In a reverse-include search, you use a nested `<ResourceType>List` block to search for the resources that reference the current resource. The special `_reference` search parameter indicates which search parameter from the target resource references the current resource.

In the example below, we first search for a `Patient` by id, and then find all the `Encounter` resources whose `Encounter.patient` search parameter points to the current Patient.

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="PatientWithRelatedEncountersGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="PatientWithRelatedEncountersTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="PatientWithRelatedEncountersCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="PatientWithRelatedEncountersResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

See the "[Reverse References](https://hl7.org/fhir/r4/graphql.html#searching)" section of the FHIR GraphQL specification for more information.

## Filtering lists with field arguments

FHIR GraphQL supports filtering array properties using field arguments. For example, you can filter the `Patient.name` array by the `use` field:

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="FilterPatientNameByUseGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="FilterPatientNameByUseTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="FilterPatientNameByUseCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="FilterPatientNameByUseResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

Another common use is to filter an `extension` array by `url`:

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="FilterExtensionByUrlGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="FilterExtensionByUrlTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="FilterExtensionByUrlCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="FilterExtensionByUrlResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

If more powerful filtering capabilities are required, a FHIRPath expression can be evaluated to select which list items are included in the response. The expression should evaluate to `true` for an item to be included. This example selects all patient names without a family part:

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="FilterExtensionByFHIRPathGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="FilterPatientNameByFHIRPathTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="FilterPatientNameByFHIRPathResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

:::tip Query Performance

Evaluating FHIRPath expressions can be relatively expensive; consider whether results could easily be filtered by the client instead.

:::

See the "[List Navigation](https://hl7.org/fhir/r4/graphql.html#list)" section of the FHIR GraphQL specification for more information.

## Putting it all together

The FHIR GraphQL syntax is a powerful way to query for multiple related resources in a single HTTP call. The following example combines previous concepts.

This query searches for a list of `Patients` named `"Eve"`, living in `"Philadelphia"`, and then searches for all `DiagnosticReports` linked to each `Patient` along with their corresponding `Observations`.

<Tabs groupId="language">
  <TabItem value="graphql" label="GraphQL">
    <MedplumCodeBlock language="graphql" selectBlocks="PatientsWithReportsGraphQL">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="PatientsWithReportsTS">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="PatientsWithReportsCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<details>
  <summary>Example Response</summary>
  <MedplumCodeBlock language="ts" selectBlocks="PatientsWithReportsResponse">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Conclusion

With a deeper understanding of the FHIR GraphQL syntax, you can now leverage build efficient and flexible FHIR queries for your applications. Remember to experiment with the API at [graphiql.medplum.com](https://graphiql.medplum.com/) as you develop your application.
