---
id: reading-data
title: Reading Data
toc_max_heading_level: 5
weight: 30
---

A very common operation is reading the data of a specified resource given its `id`. The FHIR `read` operation is used by sending an HTTP `GET` request.

Medplum also provides the `readResource` helper function as a part of the `MedplumClient`. This function takes a `resourceType` and `id` of the resource you would like to read.

{{< tabs groupId="language" >}}
  {{< tab value="ts" label="Typescript" >}}
    <MedplumCodeBlock language="ts" selectBlocks="readTs">
      {ExampleCode}
    </MedplumCodeBlock>
  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}
    <MedplumCodeBlock language="bash" selectBlocks="readCli">
      {ExampleCode}
    </MedplumCodeBlock>
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
    <MedplumCodeBlock language="bash" selectBlocks="readCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  {{< /tab >}}
{{< /tabs >}}

{{< note title="Reading a Deleted Resource" >}}

If you attempt to read a resource with an `id` that does not exist, you will receive a status code of `404 Not Found`. However, if you search for a resource that has been deleted you will receive a staus code of `410 Gone`.

{{< /note >}}
{{< note title="Reading Multiple Resources" >}}

If you want to read multiple resources, you should use Medplum's search functionality. For more info see the [Search Basics docs](/docs/search/basic-search)

{{< /note >}}
