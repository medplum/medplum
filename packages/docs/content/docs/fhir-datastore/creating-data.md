---
id: creating-data
title: Creating Data
weight: 20
toc_max_heading_level: 4
---

Data is created in FHIR by using the `create` operation, which is performed by sending a `POST` request to the server.

Medplum also provides the `createResource` method on the `MedplumClient` which implements the `create` operation. When creating a resource, you do not need to provide an `id`, as it will be assigned by the server.

<details>
  <summary>Example: Creating a Practitioner</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/fhir-datastore/creating-data.ts" language="ts" blocks="createTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/fhir-datastore/creating-data.ts" language="bash" blocks="createCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/fhir-datastore/creating-data.ts" language="bash" blocks="createCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>
