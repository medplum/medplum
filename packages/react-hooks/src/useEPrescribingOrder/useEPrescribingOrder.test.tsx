// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { INVALID_MEDICATION_ORDER_RESPONSE, INVALID_MEDICATION_SEARCH_RESPONSE } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useEPrescribingOrder } from './useEPrescribingOrder';

const SEARCH_BOT = { system: 'https://www.medplum.com/bots', value: 'drug-search' };
const ORDER_BOT = { system: 'https://www.medplum.com/bots', value: 'order-medication' };

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>
      </MemoryRouter>
    );
  };
}

describe('useEPrescribingOrder', () => {
  test('searchMedications returns validated Medication array', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'executeBot').mockResolvedValueOnce([{ resourceType: 'Medication', id: 'm1' }]);

    const { result } = renderHook(() => useEPrescribingOrder(SEARCH_BOT, ORDER_BOT), {
      wrapper: wrapper(medplum),
    });

    let meds: unknown;
    await act(async () => {
      meds = await result.current.searchMedications({ term: 'aspirin' });
    });

    expect(meds).toEqual([{ resourceType: 'Medication', id: 'm1' }]);
    expect(medplum.executeBot).toHaveBeenCalledWith(SEARCH_BOT, { term: 'aspirin' });
  });

  test('searchMedications throws on invalid response', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'executeBot').mockResolvedValueOnce({ not: 'medications' });

    const { result } = renderHook(() => useEPrescribingOrder(SEARCH_BOT, ORDER_BOT), {
      wrapper: wrapper(medplum),
    });

    await expect(result.current.searchMedications({ term: 'x' })).rejects.toThrow(INVALID_MEDICATION_SEARCH_RESPONSE);
  });

  test('orderMedication returns validated response', async () => {
    const medplum = new MockClient();
    const orderResponse = {
      orderId: 1,
      scriptSurePatientId: 2,
      launchUrl: 'https://example.com/iframe',
    };
    jest.spyOn(medplum, 'executeBot').mockResolvedValueOnce(orderResponse);

    const { result } = renderHook(() => useEPrescribingOrder(SEARCH_BOT, ORDER_BOT), {
      wrapper: wrapper(medplum),
    });

    let out: unknown;
    await act(async () => {
      out = await result.current.orderMedication({ patientId: 'p1' });
    });

    expect(out).toEqual(orderResponse);
    expect(medplum.executeBot).toHaveBeenCalledWith(ORDER_BOT, { patientId: 'p1' });
  });

  test('orderMedication throws on invalid response', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'executeBot').mockResolvedValueOnce({ launchUrl: 'only-url' });

    const { result } = renderHook(() => useEPrescribingOrder(SEARCH_BOT, ORDER_BOT), {
      wrapper: wrapper(medplum),
    });

    await expect(result.current.orderMedication({ patientId: 'p1' })).rejects.toThrow(INVALID_MEDICATION_ORDER_RESPONSE);
  });
});
