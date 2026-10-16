---
id: index
title: GraphQL
---

Medplum supports the [FHIR GraphQL API](https://hl7.org/fhir/r4/graphql.html) for creating, updating and searching FHIR resources.

Clinical data is often comprised of multiple FHIR resources, and the FHIR GraphQL API makes it easy to query multiple linked resources in a single request.

The GraphQL API also allows you to request specific elements, rather than full resources, which can be more efficient in bandwidth constrained settings.

To experiment with the API, you can use Medplum's interactive GraphQL environment at [graphiql.medplum.com](https://graphiql.medplum.com/). You can log in with your Medplum credentials, and run these example queries in the GraphiQL IDE.

{{< note title="Schema Introspection" >}}
Schema introspection is supported on Medplum, but for security and performance reasons, it is disabled by default. To enable it, you will need to enable the `introspectionEnabled` flag in your server config.
{{< /note >}}

## How to perform basic GraphQL queries

GraphQL queries allow you to request specific resourced fields. In a FHIR GraphQL query, you will use the resource type as the root, followed by the ID in parentheses. The requested fields are enclosed in curly braces.

For example, to request a `Patient` by ID:

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="GetPatientByIdGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="GetPatientByIdTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="GetPatientByIdCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="GetPatientByIdResponse" >}}
</details>

This query retrieves the `resourceType`, `id`, `name`, and `address` of the specified `Patient`.

{{< note title="Access Policies" >}}
When using GraphQL, [access policies](/docs/access/access-policies) are enforced, so users will not be able to read or edit any resources (or inner fields) they do not have access to.
{{< /note >}}

## How to perform FHIR searches with GraphQL

To perform a FHIR search, append the word `"List"` to the FHIR resource type. For example, to search for Patient resources use `"PatientList"`. You will specify search parameters as query parameters, similarly to [basic REST search](/docs/search/basic-search).

GraphQL also allows you to [alias returned fields](https://devinschulz.com/rename-fields-by-using-aliases-in-graphql/) to make the results more readable.

{{< warning title="Warning" >}}

When using FHIR GraphQL, you must still use [FHIR search parameters](/docs/search/basic-search#search-parameters); however, the search parameter names use **snake_case** instead of the **kebab-case** commonly used in the FHIR REST API.

{{< /warning >}}

To search for a list of `Patient` resources with a specific name and city:

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="SearchPatientsByNameAndCityGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="SearchPatientsByNameAndCityTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="SearchPatientsByNameAndCityCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="SearchPatientsByNameAndCityResponse" >}}
</details>

This query searches for Patient resources with the name `"Eve"` and a city of `"Philadelphia"`, and aliases the list of patients as `patients` in the response.

See the "[Searching Resources](https://hl7.org/fhir/r4/graphql.html#searching)" section of the FHIR GraphQL specification for more information.

{{< warning title="Search Modifiers" >}}

The [official FHIR GraphQL specification](https://hl7.org/fhir/R4/graphql.html) currently does not support [search modifiers](/docs/search/basic-search#search-modifiers) such as `:not`, `:missing`, and `:contains`. If you'd like to participate or learn more, join the discussion [here](https://chat.fhir.org/#narrow/stream/192326-graphql/topic/Search.20Modifiers.20in.20GraphQL/near/340283410).

{{< /warning >}}

## Resolving nested resources with the `resource` element

Clinical data is often spread across multiple FHIR resources that reference each other. The FHIR GraphQL API contains a special `resource` element to resolve these references and retrieve the nested resources.

To resolve a reference, you need to use the GraphQL inline fragment syntax `(... on ResourceType)`. Inline fragments allow you to request fields on a specific type within a more general parent type. This is important for FHIR GraphQL queries because the resource field can return different types of resources depending on the reference.

For example, to retrieve a `DiagnosticReport` and all the `Observation` resources referenced by `DiagnosticReport.result`:

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="DiagnosticReportWithObservationsGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="DiagnosticReportWithObservationsTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="DiagnosticReportWithObservationsCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="DiagnosticReportWithObservationsResponse" >}}
</details>

This query retrieves a `DiagnosticReport` and the `Observation` resources associated with it.

See the "[Resource References](https://hl7.org/fhir/r4/graphql.html#references)" section of the FHIR GraphQL specification for more information.

## Searching reverse references using the `_reference` keyword

FHIR GraphQL also supports reverse-reference searches, which allow you to find resources that _point to_ the current resource.

In a reverse-include search, you use a nested `<ResourceType>List` block to search for the resources that reference the current resource. The special `_reference` search parameter indicates which search parameter from the target resource references the current resource.

In the example below, we first search for a `Patient` by id, and then find all the `Encounter` resources whose `Encounter.patient` search parameter points to the current Patient.

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="PatientWithRelatedEncountersGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="PatientWithRelatedEncountersTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="PatientWithRelatedEncountersCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="PatientWithRelatedEncountersResponse" >}}
</details>

See the "[Reverse References](https://hl7.org/fhir/r4/graphql.html#searching)" section of the FHIR GraphQL specification for more information.

{{< note title="Chained Search in GraphQL" >}}
When searching on references in GraphQL, you _cannot_ filter on the parameters of the referenced resources. This is called chained search and it is not supported by the FHIR GraphQL spec. However, it is supported in the FHIR Rest API. For more details see the [Chained Search docs](/docs/search/chained-search).
{{< /note >}}

## Filtering lists with field arguments

FHIR GraphQL supports filtering array properties using field arguments. For example, you can filter the `Patient.name` array by the `use` field:

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="FilterPatientNameByUseGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="FilterPatientNameByUseTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="FilterPatientNameByUseCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="FilterPatientNameByUseResponse" >}}
</details>

Another common use is to filter an `extension` array by `url`:

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="FilterExtensionByUrlGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="FilterExtensionByUrlTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="FilterExtensionByUrlCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="FilterExtensionByUrlResponse" >}}
</details>

If more powerful filtering capabilities are required, a FHIRPath expression can be evaluated to select which list items are included in the response. The expression should evaluate to `true` for an item to be included. This example selects all patient names without a family part:

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="FilterExtensionByFHIRPathGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="FilterPatientNameByFHIRPathTS" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="FilterPatientNameByFHIRPathResponse" >}}
</details>

{{< tip title="Query Performance" >}}

Evaluating FHIRPath expressions can be relatively expensive; consider whether results could easily be filtered by the client instead.

{{< /tip >}}

See the "[List Navigation](https://hl7.org/fhir/r4/graphql.html#list)" section of the FHIR GraphQL specification for more information.

## Putting it all together

The FHIR GraphQL syntax is a powerful way to query for multiple related resources in a single HTTP call. The following example combines previous concepts.

This query searches for a list of `Patients` named `"Eve"`, living in `"Philadelphia"`, and then searches for all `DiagnosticReports` linked to each `Patient` along with their corresponding `Observations`.

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="PatientsWithReportsGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="PatientsWithReportsTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="PatientsWithReportsCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
<summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="PatientsWithReportsResponse" >}}
</details>

## Summary

With a deeper understanding of the FHIR GraphQL syntax, you can now leverage build efficient and flexible FHIR queries for your applications. Remember to experiment with the API at [graphiql.medplum.com](https://graphiql.medplum.com/) as you develop your application.
