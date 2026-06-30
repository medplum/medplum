// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { INVALID_MEDICATION_CHECKOUT_RESPONSE } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useMedicationCheckout } from './useMedicationCheckout';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>
      </MemoryRouter>
    );
  };
}

const CHECKOUT_URL = 'fhir/R4/MedicationRequest/$checkout-medications';

describe('useMedicationCheckout', () => {
  test('checkout POSTs to $checkout-medications and decodes the Parameters response', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'approvalUrl', valueUri: 'https://example.com/widgets/medcart/24057?sessiontoken=tok' },
        { name: 'vendorPatientId', valueInteger: 24057 },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-1' },
            { name: 'vendorLineId', valueString: 'rx-1' },
            { name: 'status', valueCode: 'queued' },
          ],
        },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-2' },
            { name: 'status', valueCode: 'failed' },
            { name: 'error', valueString: 'no rxnorm' },
          ],
        },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useMedicationCheckout(), { wrapper: wrapper(medplum) });

    let out: unknown;
    await act(async () => {
      out = await result.current.checkout({ patientId: 'p1', medicationRequestIds: ['mr-1', 'mr-2'] });
    });

    expect(out).toEqual({
      approvalUrl: 'https://example.com/widgets/medcart/24057?sessiontoken=tok',
      vendorPatientId: 24057,
      items: [
        { medicationRequestId: 'mr-1', vendorLineId: 'rx-1', status: 'queued' },
        { medicationRequestId: 'mr-2', status: 'failed', error: 'no rxnorm' },
      ],
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(CHECKOUT_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'medicationRequestIds', valueId: 'mr-1' },
        { name: 'medicationRequestIds', valueId: 'mr-2' },
      ],
    });
  });

  test('checkout throws when response is not a Parameters envelope', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce({ approvalUrl: 'only-url' });

    const { result } = renderHook(() => useMedicationCheckout(), { wrapper: wrapper(medplum) });

    await expect(
      result.current.checkout({ patientId: 'p1', medicationRequestIds: ['mr-1'] })
    ).rejects.toThrow(INVALID_MEDICATION_CHECKOUT_RESPONSE);
  });

  test('checkout throws when Parameters payload is missing approvalUrl', async () => {
    const medplum = new MockClient();
    const malformed: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'vendorPatientId', valueInteger: 1 }],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(malformed);

    const { result } = renderHook(() => useMedicationCheckout(), { wrapper: wrapper(medplum) });

    await expect(
      result.current.checkout({ patientId: 'p1', medicationRequestIds: ['mr-1'] })
    ).rejects.toThrow(INVALID_MEDICATION_CHECKOUT_RESPONSE);
  });
});
