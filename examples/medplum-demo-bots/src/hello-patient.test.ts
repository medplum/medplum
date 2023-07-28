import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './hello-patient';

const medplum = new MockClient();

test('Hello world', async () => {
  const input = 'Hello';
  const contentType = 'text/plain';
  const secrets = {};
  const result = await handler(medplum, { input, contentType, secrets });
  expect(result).toBe(true);
});
