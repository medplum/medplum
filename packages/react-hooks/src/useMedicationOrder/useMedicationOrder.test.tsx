// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { INVALID_MEDICATION_ORDER_RESPONSE, INVALID_MEDICATION_SEARCH_RESPONSE } from '@medplum/core';
import type { Bundle, Medication, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useMedicationOrder } from './useMedicationOrder';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>
      </MemoryRouter>
    );
  };
}

const SEARCH_URL = 'fhir/R4/Medication/$drug-search';
const ORDER_URL = 'fhir/R4/MedicationRequest/$order-medication';

describe('useMedicationOrder', () => {
  test('searchMedications POSTs to $drug-search and unwraps Bundle<Medication>', async () => {
    const medplum = new MockClient();
    const bundle: Bundle<Medication> = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: { resourceType: 'Medication', id: 'm1' } }],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(bundle);

    const { result } = renderHook(() => useMedicationOrder(), { wrapper: wrapper(medplum) });

    let meds: Medication[] | undefined;
    await act(async () => {
      meds = await result.current.searchMedications({ term: 'aspirin' });
    });

    expect(meds).toEqual([{ resourceType: 'Medication', id: 'm1' }]);
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(SEARCH_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'term', valueString: 'aspirin' }],
    });
  });

  test('searchMedications throws when response is not a Bundle', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce({ not: 'a bundle' });

    const { result } = renderHook(() => useMedicationOrder(), { wrapper: wrapper(medplum) });

    await expect(result.current.searchMedications({ term: 'x' })).rejects.toThrow(INVALID_MEDICATION_SEARCH_RESPONSE);
  });

  test('orderMedication POSTs to $order-medication and decodes Parameters', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'orderId', valueInteger: 1 },
        { name: 'vendorPatientId', valueInteger: 2 },
        { name: 'launchUrl', valueUri: 'https://example.com/iframe' },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useMedicationOrder(), { wrapper: wrapper(medplum) });

    let out: unknown;
    await act(async () => {
      out = await result.current.orderMedication({ patientId: 'p1' });
    });

    expect(out).toEqual({
      orderId: 1,
      vendorPatientId: 2,
      launchUrl: 'https://example.com/iframe',
      medicationRequestId: undefined,
      pendingOrderStatus: undefined,
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(ORDER_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'patientId', valueId: 'p1' }],
    });
  });

  test('orderMedication throws when response is not a Parameters envelope', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce({ launchUrl: 'only-url' });

    const { result } = renderHook(() => useMedicationOrder(), { wrapper: wrapper(medplum) });

    await expect(result.current.orderMedication({ patientId: 'p1' })).rejects.toThrow(
      INVALID_MEDICATION_ORDER_RESPONSE
    );
  });

  test('orderMedication throws when Parameters payload is missing required fields', async () => {
    const medplum = new MockClient();
    // Valid envelope, but missing vendorPatientId + launchUrl — should surface
    // INVALID_MEDICATION_ORDER_RESPONSE so callers can clean up draft MRs.
    const malformed: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'orderId', valueInteger: 1 }],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(malformed);

    const { result } = renderHook(() => useMedicationOrder(), { wrapper: wrapper(medplum) });

    await expect(result.current.orderMedication({ patientId: 'p1' })).rejects.toThrow(
      INVALID_MEDICATION_ORDER_RESPONSE
    );
  });
});
