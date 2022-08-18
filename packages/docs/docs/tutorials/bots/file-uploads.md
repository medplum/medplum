# Uploading Files

In digital health, a common pattern is to upload PDFs or other files from one system to another. Examples include:

- Uploading pathology reports into a legacy EHR
- Uploading service requisitions into an SFTP server

In this guide, we will show you how to:

- Upload a create and upload a PDF file to an HTTP endpoint
-

Admission, Discharge and Transfer fees (ADT Feed)
Observation Results (OBX Feed)
Scheduling Information Unsolicited (SIU feed)
These feeds contain a wealth of information, but can be hard to manage, programmatically. Medplum makes consuming and managing these feeds straightforward.

This guide will show you
How to integrate Medplum with an HL7 feed bi-directionally, receiving messages and sending back confirmation messages.
How to convert those HL7 messages into FHIR objects

```ts
import { BotEvent, MedplumClient } from '@medplum/core';
import fetch from 'node-fetch';
import FormData from 'form-data';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Create the PDF
  const binary = await medplum.createPdf({
    content: ['Hello world'],
  });
  console.log('Binary result', JSON.stringify(binary, null, 2));

  // Download the PDF
  const binaryResponse = await fetch(binary.url as string);
  const buffer = await binaryResponse.buffer();

  // Create a multipart form body
  const form = new FormData();
  form.append('otherValue', 'hello world');
  form.append('testPdf', buffer);

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
