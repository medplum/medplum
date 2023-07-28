import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './create-pdf';

const medplum = new MockClient();

test('Create PDF', async () => {
  const input = 'Hello';
  const contentType = 'text/plain';

  const media = await handler(medplum, { input, contentType, secrets: {} });
  expect(media).toBeDefined();
  expect(media.resourceType).toEqual('Media');
  expect(media.content.contentType).toEqual('application/pdf');
  expect(media.content.url).toMatch('Binary');

  // Commenting this out until MockClient.createPDF is fixed to savePDFs properly
  // const binary = await medplum.readReference({ reference: media.content.url });
  // expect(binary).toBeDefined();
});
