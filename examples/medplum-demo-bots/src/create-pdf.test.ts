// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './create-pdf';

const medplum = new MockClient();

test('Create PDF', async () => {
  const documentReference = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: 'Hello',
    contentType: 'text/plain',
    secrets: {},
  });

  const contents = documentReference.content?.[0];
  expect(documentReference).toBeDefined();
  expect(documentReference.resourceType).toStrictEqual('DocumentReference');
  expect(contents.attachment?.contentType).toStrictEqual('application/pdf');
  expect(contents?.attachment?.url).toMatch('Binary');

  // TODO: Commenting this out until MockClient.createPDF is fixed to savePDFs properly
  // const binary = await medplum.readReference({ reference: media.content.url });
  // expect(binary).toBeDefined();
});
