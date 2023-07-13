import { expect, test } from 'vitest';
import { handler } from './sftp-upload';

vi.mock('ssh2-sftp-client');

test.skip('Hello SFTP', async () => {
  const result = await handler();
  expect(result).toBeDefined();
});
