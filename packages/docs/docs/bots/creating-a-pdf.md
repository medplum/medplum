---
sidebar_position: 6
---

# Create a PDF

You can use Medplum Bots to create a PDF file as an attachment.

There are always two steps:

1. Create the PDF as a FHIR `Binary` resource
2. Use the `Binary` resource as an attachment or content

To create PDFs, Medplum Bots use [pdfmake](https://pdfmake.github.io/docs/0.1/). pdfmake uses a "Document Definition" model. You create a JSON object that defines paragraphs, styles, tables, etc. Medplum converts the document definition into a FHIR `Binary` resource with the PDF contents.

To learn more about pdfmake, check out the [playground](http://bpampuch.github.io/pdfmake/playground.html) and [examples](https://github.com/bpampuch/pdfmake/tree/master/examples).

## FHIR Media

This bot creates a PDF as a `Binary` and then creates a `Media` with the PDF as the content.

```ts
import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Create the PDF
  const binary = await medplum.createPdf({
    content: ['Hello world'],
  });
  console.log('Binary result', binary);

  // Create a Media, representing an attachment
  const media = await medplum.createResource({
    resourceType: 'Media',
    content: {
      contentType: 'application/pdf',
      url: 'Binary/' + binary.id,
      title: 'report.pdf',
    },
  });
  console.log('Media result', media);
}
```

## Custom fonts

Medplum has prebuilt support for the following fonts:

- Helvetica
- Roboto
- Avenir

You can set the default font in the pdfmake `defaultStyle`:

```ts
const docDefinition = {
  content: { ... },
  defaultStyle: {
    font: 'yourFontName'
  }
}
```

You can also use inline styles:

```ts
const docDefinition = {
  content: [
    // If you don't need styles, you can use a simple string to define a paragraph
    'This is a standard paragraph, using default style',

    // Using a { text: '...' } object lets you set styling properties
    {
      text: 'Hello world',
      font: 'yourFontName',
    },
  ],
};
```

See the [pdfmake styling](https://pdfmake.github.io/docs/0.1/document-definition-object/styling/) page for more details.

## Embedded images

You can load an image by URL and embed it in the PDF.

```ts
import { BotEvent, MedplumClient } from '@medplum/core';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Load the image
  const image = await medplum.readResource('DocumentReference', YOUR_DOCUMENT_ID);
  const response = await fetch(image.content?.[0]?.attachment?.url as string);
  const buffer = await response.buffer();
  const imageData = 'data:' + response.headers.get('content-type') + ';base64,' + buffer.toString('base64');

  // Create the PDF
  const binary = await medplum.createPdf({
    content: [
      'Hello world',
      {
        image: imageData,
      },
    ],
  });
  console.log('Binary result', binary);

  // Create a Media, representing an attachment
  const media = await medplum.createResource({
    resourceType: 'Media',
    content: {
      contentType: 'application/pdf',
      url: 'Binary/' + binary.id,
      title: 'report.pdf',
    },
  });
  console.log('Media result', media);
  return media;
}
```

See the [pdfmake images](https://pdfmake.github.io/docs/0.1/document-definition-object/images/) page for more details.
