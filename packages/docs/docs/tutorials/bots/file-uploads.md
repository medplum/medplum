---
sidebar_position: 3
toc_max_heading_level: 2
---

# Uploading Files

In digital health, a common requirement is to upload PDFs or other files from one system to another. Examples include:

- Uploading pathology reports into a legacy EHR
- Uploading service requisitions into an SFTP server

In this guide, we will show you how to:

- Create and upload a PDF file from a Bot to an HTTP endpoint
- Upload a file form a to an SFTP server (coming soon)

## HTTP File Uploads

To upload to a file using http, you will have to submit an HTTP request with the `Content-Type` `multipart/form-data`. Medplum Bots ship with the npm [`form-data`](https://www.npmjs.com/package/form-data) package to make it easier to create form data.

Let's take a look at an example. First, we'll create a pdf (see the [Create a PDF tutorial](./creating-a-pdf.md) for more details)

```ts
const binary = await medplum.createPdf({
  content: ['Hello Medplum'],
});
console.log('Binary result', JSON.stringify(binary, null, 2));
```

[`medplum.createPdf()`](/docs/sdk/classes/MedplumClient.md#createpdf) creates a [`Binary`](/docs/api/fhir/resources/binary.mdx) resource and stores it on the Medplum server. Our next step will be to download the resulting PDF data, and convert it to a stream to send to our 3rd party API.

```ts
// Download the PDF
const pdfData = await medplum.download(binary.url);
const pdfStream = await pdfData.stream();
```

Next, we'll construct the request body using the `form-data` library

```ts
// Create a multipart form body
const form = new FormData();
form.append('otherValue', 'hello medplum');
form.append('testPdf', pdfStream);
```

And lastly, we'll post the form to the API (here, we're just using [httpbin](#)) as an example

```ts
// Post the form
const response = await fetch('https://httpbin.org/post', {
  method: 'POST',
  body: form,
  headers: form.getHeaders(),
});
```

This is what it looks like all put together. You can also see this example in our [Medplum Demo Bots](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/form-data-upload.ts) repo.

```ts
import { BotEvent, MedplumClient } from '@medplum/core';
import fetch from 'node-fetch';
import FormData from 'form-data';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Create the PDF
  const binary = await medplum.createPdf({
    content: ['Hello Medplum'],
  });
  console.log('Binary result', JSON.stringify(binary, null, 2));

  if (!binary.url) {
    throw new Error('Binary is missing');
  }

  // Download the PDF
  const pdfData = await medplum.download(binary.url);
  const pdfStream = await pdfData.stream();

  // Create a multipart form body
  const form = new FormData();
  form.append('otherValue', 'hello medplum');
  form.append('testPdf', pdfStream);

  // Post the form
  const response = await fetch('https://httpbin.org/post', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  // Show the JSON response
  const json = await response.json();
  console.log('response', json);
  return json;
}
```

## SFTP Uploads

_Coming Soon_

_If you need this feature sooner, please reach out to us at [support@medplum.com](mailto:support@medplum.com) or ping us in our [Discord](https://discord.gg/UBAWwvrVeN)_
