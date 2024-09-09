import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  console.log(event);

  // Generate the PDF
  const binary = await medplum.createPdf({
    docDefinition: {
      content: [
        'First paragraph',
        'Another paragraph, this time a little bit longer to make sure, this line will be divided into at least two lines',
      ],
    },
  });

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

  return media;
}
