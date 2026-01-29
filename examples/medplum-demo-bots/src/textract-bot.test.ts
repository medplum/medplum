// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './textract-bot';

test('AWS Textract', async () => {
  const medplum = new MockClient();

  // Mock the medplum.post method
  // @ts-expect-error This stub doesn't match the implementation type; this is fine for this test.
  medplum.post = async () => ({
    JobStatus: 'SUCCEEDED',
    Blocks: [
      { BlockType: 'WORD', Text: 'Hello' },
      { BlockType: 'WORD', Text: 'World' },
    ],
  });

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    contentType: 'application/fhir+json',
    input: { resourceType: 'Media', id: '456' },
    secrets: {},
  });

  expect(result).toBeDefined();
  expect(result).toEqual('Hello\nWorld');
});
