// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, QuestionnaireResponse } from '@medplum/fhirtypes';
import { describe, expect, test, vi } from 'vitest';
import { extractQuestionnaireResponse } from './extractQuestionnaireResponse';

function createClient(extractBundle: Bundle): Parameters<typeof extractQuestionnaireResponse>[0] {
  return {
    executeBatch: vi.fn().mockResolvedValue(undefined),
    fhirUrl: vi.fn((resourceType: string, id: string, operation: string) => `/${resourceType}/${id}/${operation}`),
    get: vi.fn().mockResolvedValue(extractBundle),
  } as unknown as Parameters<typeof extractQuestionnaireResponse>[0];
}

const response: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: 'response-1',
  status: 'completed',
};

describe('extractQuestionnaireResponse', () => {
  test('gets and applies the transaction Bundle returned by SDC extraction', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [{ request: { method: 'POST', url: 'Patient' } }],
    };
    const client = createClient(bundle);

    await extractQuestionnaireResponse(client, response);

    expect(client.fhirUrl).toHaveBeenCalledWith('QuestionnaireResponse', 'response-1', '$extract');
    expect(client.get).toHaveBeenCalledWith('/QuestionnaireResponse/response-1/$extract');
    expect(client.executeBatch).toHaveBeenCalledWith(bundle);
  });

  test('does not submit an empty extraction Bundle', async () => {
    const client = createClient({ resourceType: 'Bundle', type: 'transaction' });

    await extractQuestionnaireResponse(client, response);

    expect(client.executeBatch).not.toHaveBeenCalled();
  });

  test('requires a saved QuestionnaireResponse', async () => {
    const client = createClient({ resourceType: 'Bundle', type: 'transaction' });

    await expect(extractQuestionnaireResponse(client, { ...response, id: undefined })).rejects.toThrow(
      'QuestionnaireResponse was created without an id'
    );
    expect(client.get).not.toHaveBeenCalled();
  });
});
