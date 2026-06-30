// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { INVALID_MEDICATION_CART_RESPONSE } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useMedicationCart } from './useMedicationCart';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>
      </MemoryRouter>
    );
  };
}

const REMOVE_URL = 'fhir/R4/MedicationRequest/$remove-cart-medication';
const CLEAR_URL = 'fhir/R4/MedicationRequest/$clear-cart';

describe('useMedicationCart', () => {
  test('removeFromCart POSTs to $remove-cart-medication and decodes the Parameters response', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'vendorPatientId', valueInteger: 24057 },
        { name: 'removedCount', valueInteger: 1 },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-1' },
            { name: 'vendorLineId', valueString: 'rx-1' },
            { name: 'status', valueCode: 'removed' },
          ],
        },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    let out: unknown;
    await act(async () => {
      out = await result.current.removeFromCart({ patientId: 'p1', medicationRequestId: 'mr-1' });
    });

    expect(out).toEqual({
      vendorPatientId: 24057,
      removedCount: 1,
      items: [{ medicationRequestId: 'mr-1', vendorLineId: 'rx-1', status: 'removed' }],
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(REMOVE_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'action', valueCode: 'remove' },
        { name: 'medicationRequestId', valueId: 'mr-1' },
      ],
    });
  });

  test('clearCart POSTs to $clear-cart and decodes the Parameters response', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'vendorPatientId', valueInteger: 24057 },
        { name: 'removedCount', valueInteger: 2 },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-a' },
            { name: 'status', valueCode: 'removed' },
          ],
        },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-b' },
            { name: 'status', valueCode: 'failed' },
            { name: 'error', valueString: 'vendor 500' },
          ],
        },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    let out: unknown;
    await act(async () => {
      out = await result.current.clearCart({ patientId: 'p1' });
    });

    expect(out).toEqual({
      vendorPatientId: 24057,
      removedCount: 2,
      items: [
        { medicationRequestId: 'mr-a', status: 'removed' },
        { medicationRequestId: 'mr-b', status: 'failed', error: 'vendor 500' },
      ],
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(CLEAR_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'action', valueCode: 'clear' },
      ],
    });
  });

  test('removeFromCart throws when response is not a Parameters envelope', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce({ removedCount: 1 });

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    await expect(
      result.current.removeFromCart({ patientId: 'p1', medicationRequestId: 'mr-1' })
    ).rejects.toThrow(INVALID_MEDICATION_CART_RESPONSE);
  });
});
