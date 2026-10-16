---
id: connections
title: Connection API
weight: 30
---

Using the normal "List" search (i.e., "PatientList") is the most common way to search for resources. However, the FHIR GraphQL specification also supports the [Connection API](https://hl7.org/fhir/graphql.html#searching), which is a more complex way to search for resources.

The most immediate advantage of the Connection API is support for retrieving total counts. The Connection API also includes more features from FHIR Bundle such as `mode` and `score`.

To use the Connection API, append "Connection" to the resource type rather than "List". For example, use "PatientConnection" instead of "PatientList".

Here is an example of searching for a list of `Patient` resources using the Connection API:

{{< tabs groupId="language" >}}
  {{< tab value="graphql" label="GraphQL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="graphql" blocks="ConnectionApiGraphQL" >}}
  {{< /tab >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="ConnectionApiTS" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="bash" blocks="ConnectionApiCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

<details>
  <summary>Example Response</summary>

{{< code-example file="packages/examples/src/graphql/basic-query.ts" language="ts" blocks="ConnectionApiResponse" >}}
</details>

See the "[Connection API](https://hl7.org/fhir/graphql.html#searching)" section of the FHIR GraphQL specification for more information.
