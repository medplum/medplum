import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './form-data-upload';

const medplum = new MockClient();

test.skip('Form Data Upload', async () => {
  const response = await handler(medplum);
  expect(response.form).toBeDefined();
});
