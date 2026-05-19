// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { loadScriptSureQuantityQualifiers } from './loadScriptSureQuantityQualifiers';

describe('loadScriptSureQuantityQualifiers', () => {
  test('POSTs to $drug-quantity-qualifiers and parses quantityQualifier parts', async () => {
    const medplum = new MockClient();
    const response: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'quantityQualifier',
          part: [
            { name: 'code', valueString: 'C48542' },
            { name: 'label', valueString: 'Tablet dosing unit' },
          ],
        },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(response);

    const rows = await loadScriptSureQuantityQualifiers(medplum);

    expect(rows).toEqual([{ code: 'C48542', label: 'Tablet dosing unit' }]);
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain('Medication/$drug-quantity-qualifiers');
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'quantityQualifiers', valueBoolean: true }],
    });
  });

  test('returns empty array when response is not Parameters', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce({ resourceType: 'Bundle', type: 'searchset' });

    await expect(loadScriptSureQuantityQualifiers(medplum)).resolves.toEqual([]);
  });

  test('skips malformed quantityQualifier parts', async () => {
    const medplum = new MockClient();
    const response: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'quantityQualifier',
          part: [{ name: 'code', valueString: 'C48542' }],
        },
        {
          name: 'quantityQualifier',
          part: [
            { name: 'code', valueString: 'C48480' },
            { name: 'label', valueString: 'mL' },
          ],
        },
      ],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(response);

    await expect(loadScriptSureQuantityQualifiers(medplum)).resolves.toEqual([
      { code: 'C48480', label: 'mL' },
    ]);
  });
});
