// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { SCRIPTSURE_ORDER_SET_BOT } from './common';
import { useScriptSureOrderSet } from './useScriptSureOrderSet';

const URL_A = 'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokA';
const URL_B = 'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokB';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useScriptSureOrderSet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('forwards scriptSureOrdersetId to the order-set bot under the vendor field name', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn().mockResolvedValue({ url: URL_A, scriptSurePatientId: 100, scriptSureOrdersetId: 377 });

    const { result } = renderHook(() => useScriptSureOrderSet({ patientId: 'p1', scriptSureOrdersetId: 377 }), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.url).toBe(URL_A));
    expect(medplum.executeBot).toHaveBeenCalledWith(SCRIPTSURE_ORDER_SET_BOT, {
      patientId: 'p1',
      scriptSureOrdersetId: 377,
    });
  });

  test('forwards planDefinitionId branch when no scriptSureOrdersetId is set', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn().mockResolvedValue({ url: URL_A });

    renderHook(() => useScriptSureOrderSet({ patientId: 'p1', planDefinitionId: 'pd-1' }), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(medplum.executeBot).toHaveBeenCalled());
    expect(medplum.executeBot).toHaveBeenCalledWith(SCRIPTSURE_ORDER_SET_BOT, {
      patientId: 'p1',
      planDefinitionId: 'pd-1',
    });
  });

  test('refresh() returns the latest URL', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn().mockResolvedValueOnce({ url: URL_A }).mockResolvedValueOnce({ url: URL_B });

    const { result } = renderHook(() => useScriptSureOrderSet({ patientId: 'p1', scriptSureOrdersetId: 377 }), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.url).toBe(URL_A));

    let refreshed: string | undefined;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBe(URL_B);
    expect(result.current.url).toBe(URL_B);
  });
});
