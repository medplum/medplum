// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block coreImports
import { BotEvent, MedplumClient } from '@medplum/core';
// end-block coreImports

// start-block pdfBot
export async function handler(medplum: MedplumClient, _event: BotEvent): Promise<any> {
  // Create the PDF
  const binary = await medplum.createPdf({
    docDefinition: {
      content: ['Hello world'],
    },
  });
  console.log('Binary result', binary);

  // Create a Media, representing an attachment
  const media = await medplum.createResource({
    resourceType: 'Media',
    status: 'completed',
    content: {
      contentType: 'application/pdf',
      url: 'Binary/' + binary.id,
      title: 'report.pdf',
    },
  });
  console.log('Media result', media);
}
// end-block pdfBot

let YOUR_DOCUMENT_ID: any;
// start-block embeddedImages
import fetch from 'node-fetch';

export async function botHandler(medplum: MedplumClient, _event: BotEvent): Promise<any> {
  // Load the image
  const image = await medplum.readResource('DocumentReference', YOUR_DOCUMENT_ID);
  const response = await fetch(image.content?.[0]?.attachment?.url as string);
  const buffer = await response.buffer();
  const imageData = `data:${response.headers.get('content-type')};base64,${buffer.toString('base64')}`;

  // Create the PDF
  const binary = await medplum.createPdf({
    docDefinition: {
      content: ['Hello world', { image: imageData }],
    },
  });
  console.log('Binary result', binary);

  // Create a Media, representing an attachment
  const media = await medplum.createResource({
    resourceType: 'Media',
    status: 'completed',
    content: {
      contentType: 'application/pdf',
      url: 'Binary/' + binary.id,
      title: 'report.pdf',
    },
  });
  console.log('Media result', media);
  return media;
}
// end-block embeddedImages
