import { Bot, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './hello-patient';

const medplum = new MockClient();

test('Hello world', async () => {
  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const input = 'Hello';
  const contentType = 'text/plain';
  const secrets = {};
  const result = await handler(medplum, { bot, input, contentType, secrets });
  expect(result).toBe(true);
});
