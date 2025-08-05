// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from './client';
import { mockFetchResponse } from './client-test-utils';

describe('KeyValue', () => {
  test('Happy path', async () => {
    const state = {
      value: undefined,
    };

    const mockFetch = async (url: string, options: any): Promise<any> => {
      const method = options.method;
      switch (method) {
        case 'GET':
          if (state.value) {
            return mockFetchResponse(200, state.value, { 'content-type': 'text/plain' });
          } else {
            return mockFetchResponse(404, undefined, { 'content-type': 'text/plain' });
          }
        case 'PUT':
          state.value = options.body;
          return mockFetchResponse(204, undefined);
        case 'DELETE':
          state.value = undefined;
          return mockFetchResponse(204, undefined);
      }
      throw new Error('Invalid method');
    };

    const medplum = new MedplumClient({ fetch: mockFetch });
    await expect(medplum.keyValue.get('test')).rejects.toThrow('Not found');

    await medplum.keyValue.set('test', 'value');
    await expect(medplum.keyValue.get('test')).resolves.toBe('value');

    await medplum.keyValue.delete('test');
    await expect(medplum.keyValue.get('test')).rejects.toThrow('Not found');
  });
});
