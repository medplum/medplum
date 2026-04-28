// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { SCRIPTSURE_DRUG_SEARCH_BOT, SCRIPTSURE_ORDER_MEDICATION_BOT } from './common';
import { useScriptSureOrderMedication } from './useScriptSureOrderMedication';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useScriptSureOrderMedication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('forwards drug search to scriptsure-drug-search-bot', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn().mockResolvedValueOnce([{ resourceType: 'Medication', id: 'm1' }]);

    const { result } = renderHook(() => useScriptSureOrderMedication(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await result.current.searchMedications({ term: 'lipitor' });
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(SCRIPTSURE_DRUG_SEARCH_BOT, { term: 'lipitor' });
  });

  test('forwards order to scriptsure-order-medication-bot', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi
      .fn()
      .mockResolvedValueOnce({ orderId: 1, scriptSurePatientId: 2, launchUrl: 'https://iframe.example/' });

    const { result } = renderHook(() => useScriptSureOrderMedication(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await result.current.orderMedication({ patientId: 'p1', medicationRequestId: 'mr1' });
    });

    expect(medplum.executeBot).toHaveBeenCalledWith(SCRIPTSURE_ORDER_MEDICATION_BOT, {
      patientId: 'p1',
      medicationRequestId: 'mr1',
    });
  });
});
