---
id: external-documents
title: Handling External Files
---








## Introduction

While the most valuable way of storing healthcare information is in a structured FHIR representation, healthcare apps often need to store and index documents from external systems. For example, patients may submit medical records from other providers in the form of PDF documents.

The [`DocumentReference`](/docs/api/fhir/resources/documentreference) resource serves as a "pointer" to these external documents so that they can be indexed and searched. Specifically, `DocumentReference.content.attachment` can refer to a [`Binary`](/docs/api/fhir/resources/binary) resource (PDFs, images, videos, etc.), a URL, or anything else supported by the [`Attachment`](/docs/api/fhir/datatypes/attachment) datatype.

See the [`DocumentReference` API guide](/docs/api/fhir/resources/documentreference) for more info.

## Example: Creating a `DocumentReference` for a binary file

This is a similar process to [creating a PDF file from a Bot ](/docs/bots/creating-a-pdf).

First, upload the binary file as a [`Binary`](/docs/api/fhir/resources/binary) resource. Then, create the corresponding `DocumentReference` as a pointer. For more details on using [`Binary`] resources see the [Binary Data guide](/docs/fhir-datastore/binary-data#referencing-a-binary-in-an-attachment).

{{< tabs groupId="language" >}}
  {{< tab value="ts" label="Typescript" >}}
    <MedplumCodeBlock language="ts" selectBlocks="imports,docReferenceBinaryTS">
      {ExampleCode}
    </MedplumCodeBlock>
  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}
    <MedplumCodeBlock language="bash" selectBlocks="docReferenceBinaryCLI">
      {ExampleCode}
    </MedplumCodeBlock>
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
    <MedplumCodeBlock language="bash" selectBlocks="docReferenceBinaryCURL">
      {ExampleCode}
    </MedplumCodeBlock>
  {{< /tab >}}
{{< /tabs >}}

{{< tip title="Note" >}}

`DocumentReference.content.attachment.url` can refer to any external url. The Medplum server handles urls of the form "`Binary/id`" as a special case and converts them to pre-signed URLs at `storage.medplum.com`. You can read more about pre-signed URLs on the [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html)

{{< /tip >}}
