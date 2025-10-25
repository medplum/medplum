---
sidebar_position: 20
---

# AWS Textract/Comprehend

This documentation explains how Medplum integrates with **AWS Textract** for optical character recognition (OCR) and **AWS Comprehend Medical** for extracting clinical entities from text. This powerful combination allows developers to process and analyze unstructured medical documents, such as scanned PDFs or images, directly within their Medplum projects.

### Overview

Medplum's integration with AWS Textract and AWS Comprehend is implemented as a custom operation on FHIR `Media` and `DocumentReference` resources. This integration is designed to handle asynchronous processing of documents, making it ideal for large files.

The workflow is as follows:

1.  A `Media` or `DocumentReference` resource is created, referencing a `Binary` resource that contains the document (e.g., a PDF, JPEG, or PNG).
2.  A `POST` request is sent to the `$aws-textract` operation on the `Media` or `DocumentReference` resource.
3.  Medplum sends the document to AWS Textract for text detection. Textract processes the document and returns a job ID.
4.  Medplum polls Textract using the job ID until the processing is complete.
5.  Once Textract successfully processes the document, Medplum stores the raw JSON output as a new `Binary` and `Media` resource.
6.  If the request includes the `comprehend: true` option, Medplum extracts the text from the Textract output and sends it to AWS Comprehend Medical for entity detection.
7.  The raw JSON output from AWS Comprehend is also stored as a new `Binary` and `Media` resource.
8.  The final result of the Textract operation is returned in the API response.

This approach ensures that the original document remains untouched while the processed outputs (Textract and Comprehend JSON) are persistently stored as new FHIR resources. This allows for easy retrieval and auditing of the OCR and NLP results.

### Prerequisites

To use this feature, your Medplum project must have the `aws-textract` feature flag enabled. This can be configured in your project settings. Additionally, your Medplum server must be configured to use **AWS S3 storage** for binaries, as Textract requires an S3 object location to process documents.

### Usage

The integration is exposed via the `$aws-textract` operation on `Media` and `DocumentReference` resources.

#### Request

To start the text and entity detection process, send a `POST` request to one of the following endpoints:

**For Media resources:**
`POST /fhir/R4/Media/<id>/$aws-textract`

**For DocumentReference resources:**
`POST /fhir/R4/DocumentReference/<id>/$aws-textract`

The `<id>` is the unique identifier of the `Media` or `DocumentReference` resource containing the document you wish to process.

The request body is optional and can be used to enable the AWS Comprehend Medical integration.

- **To run Textract only:**
  ```json
  {}
  ```
- **To run both Textract and Comprehend Medical:**
  ```json
  {
    "comprehend": true
  }
  ```

#### Response

The API will return the raw JSON response from AWS Textract. The response will be a JSON object that includes an array of `Blocks` representing the detected text, tables, and forms in the document.

A successful response will have a status code of `200 OK`.

Simultaneously, Medplum will have created new `Binary` and `Media` resources for the Textract output. If Comprehend was enabled, additional resources will be created for its output as well. These resources will have a `subject` field that references the original `Media` or `DocumentReference` resource, creating a clear link between the input document and its processed outputs.

#### Examples

Here are examples of how to use the integration with both `Media` and `DocumentReference` resources:

##### Media Resource Example

```typescript
// Import necessary types and client
import { BotEvent, MedplumClient } from '@medplum/core';
import { Media } from '@medplum/fhirtypes';

/**
 * Example function to send a Media resource to the `$aws-textract` operation.
 * @param medplum The Medplum client instance.
 * @param event The BotEvent containing the Media resource.
 * @returns A string containing all the detected text, separated by newlines.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Partial<Media>>): Promise<string> {
  const media = event.input;

  // Post the Media to the `$aws-textract` operation.
  // The second argument is the request body, here we enable Comprehend.
  const textractResponse = await medplum.post(medplum.fhirUrl('Media', media.id as string, '$aws-textract'), {
    comprehend: true,
  });

  // The response contains the raw AWS Textract output.
  // You can now process this output as needed.
  const lines = textractResponse.Blocks.map((b: { Text?: string }) => b.Text).filter(Boolean);

  console.log(lines);

  return lines.join('\n');
}
```

##### DocumentReference Resource Example

```typescript
// Import necessary types and client
import { MedplumClient } from '@medplum/core';
import { DocumentReference } from '@medplum/fhirtypes';

/**
 * Example function to send a DocumentReference resource to the `$aws-textract` operation.
 * @param medplum The Medplum client instance.
 * @param docRefId The ID of the DocumentReference resource.
 * @returns A string containing all the detected text, separated by newlines.
 */
export async function processDocumentReference(medplum: MedplumClient, docRefId: string): Promise<string> {
  // Post the DocumentReference to the `$aws-textract` operation.
  // The second argument is the request body, here we enable Comprehend.
  const textractResponse = await medplum.post(
    medplum.fhirUrl('DocumentReference', docRefId, '$aws-textract'), 
    {
      comprehend: true,
    }
  );

  // The response contains the raw AWS Textract output.
  // You can now process this output as needed.
  const lines = textractResponse.Blocks.map((b: { Text?: string }) => b.Text).filter(Boolean);

  console.log(lines);

  return lines.join('\n');
}
```

These examples demonstrate how to call the `$aws-textract` operation on both `Media` and `DocumentReference` resources and process the resulting text. They're great starting points for building more complex workflows, such as extracting specific data points from a document and mapping them to other FHIR resources.

##### Key Differences Between Media and DocumentReference

- **Media**: Represents captured or recorded content (images, videos, documents)
- **DocumentReference**: A "pointer" to external documents, used for indexing and searching
- **Binary**: The actual file data storage (referenced by both Media and DocumentReference)

Both resource types can reference the same `Binary` resource, so you can use either approach depending on your use case. If you're working with documents that need OCR processing, you can now use either `Media` or `DocumentReference` resources directly.
