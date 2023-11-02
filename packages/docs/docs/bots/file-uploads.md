---
sidebar_position: 4
toc_max_heading_level: 2
---

# Uploading Files

In digital health, a common requirement is to upload PDFs or other files from one system to another. Examples include:

- Uploading pathology reports into a legacy EHR
- Uploading service requisitions into an SFTP server

In this guide, we will show you how to:

- Create and upload a PDF file from a Bot to an HTTP endpoint
- Upload a file form a to an SFTP server

You can find complete example bots for these examples in the [Medplum Demo Bots repo](https://github.com/medplum/medplum-demo-bots)

## HTTP File Uploads

To upload to a file using http, you will have to submit an HTTP request with the `Content-Type` `multipart/form-data`. Medplum Bots ship with the npm [`form-data`](https://www.npmjs.com/package/form-data) package to make it easier to create form data.

Let's take a look at an example. First, we'll create a pdf (see the [Create a PDF tutorial](./creating-a-pdf) for more details)

```ts
const binary = await medplum.createPdf({
  content: ['Hello Medplum'],
});
console.log('Binary result', JSON.stringify(binary, null, 2));
```

[`medplum.createPdf()`](../sdk/core.medplumclient.createpdf) creates a [`Binary`](/docs/api/fhir/resources/binary) resource and stores it on the Medplum server. Our next step will be to download the resulting PDF data, and convert it to a stream to send to our 3rd party API.

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

Medplum Bots provide the [ssh2-sftp-client](https://www.npmjs.com/package/ssh2-sftp-client) library to connect to SFTP servers. You can reference the library's [github page](https://github.com/theophilusx/ssh2-sftp-client) for detailed documentation on how it works.

Below is an example bot that connects to an SFTP server and returns a list of all available files at the root directory.

```ts
import { BotEvent, MedplumClient } from '@medplum/core';
import Client from 'ssh2-sftp-client';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  console.log('SFTP test');
  let data: any | undefined = undefined;
  try {
    const sftp = new Client();
    // Connect to the SFTP server
    // 'test.rebex.net' is a publicly available test server
    await sftp.connect({
      host: 'test.rebex.net',
      username: 'demo',
      password: 'password',
    });
    data = await sftp.list('.');
    console.log('data', data);
  } catch (err) {
    console.log('error', err);
    return false;
  }
  return data;
}
```
