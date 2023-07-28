import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './sync-candid-tasks';

const medplum = new MockClient();
// npm t src/examples/candid-health/sync-candid-tasks.test.ts

test.skip('Sync Tasks', async () => {
  const input = {
    id: 'evt_1MqItaDlo6kh7lYQKFQhFJ2J',
    status: 'open',
  };
  const contentType = 'application/json';

  const result = await handler(medplum, { input, contentType, secrets: {} });
  expect(result).toBeDefined();
});
