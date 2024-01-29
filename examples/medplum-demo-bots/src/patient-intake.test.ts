import { QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './patient-intake';

const contentType = 'application/fhir+json';

test('Success', async () => {
  const medplum = new MockClient();
  const input: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    item: [
      { linkId: 'firstName', answer: [{ valueString: 'John' }] },
      { linkId: 'lastName', answer: [{ valueString: 'Smith' }] },
      { linkId: 'comment', answer: [{ valueString: 'Please review urgently' }] },
    ],
  };
  const result = await handler(medplum, { input, contentType, secrets: {} });
  expect(result).toBe(true);
});

test('Missing first name', async () => {
  const medplum = new MockClient();
  console.log = vi.fn();
  const input: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    item: [
      { linkId: 'firstName', answer: [{ valueString: '' }] },
      { linkId: 'lastName', answer: [{ valueString: 'Smith' }] },
    ],
  };
  const result = await handler(medplum, { input, contentType, secrets: {} });
  expect(result).toBe(false);
  expect(console.log).toHaveBeenCalledWith('Missing first name');
});

test('Missing last name', async () => {
  const medplum = new MockClient();
  console.log = vi.fn();
  const input: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    item: [
      { linkId: 'firstName', answer: [{ valueString: 'John' }] },
      { linkId: 'lastName', answer: [{ valueString: '' }] },
    ],
  };
  const result = await handler(medplum, { input, contentType, secrets: {} });
  expect(result).toBe(false);
  expect(console.log).toHaveBeenCalledWith('Missing last name');
});
