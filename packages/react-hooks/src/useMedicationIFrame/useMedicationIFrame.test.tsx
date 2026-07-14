// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Identifier } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useMedicationIFrame } from './useMedicationIFrame';

const SYNC_BOT: Identifier = { system: 'https://example.com/bot', value: 'sync' };
const IFRAME_BOT: Identifier = { system: 'https://example.com/bot', value: 'iframe' };

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useMedicationIFrame', () => {
  test('syncs the patient then returns the iframe url, threading organizationId', async () => {
    const medplum = new MockClient();
    const executeBot = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce({}) // patient sync
      .mockResolvedValueOnce({ url: 'https://vendor.example/chart' }); // iframe
    const onPatientSyncSuccess = vi.fn();
    const onIframeSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useMedicationIFrame(SYNC_BOT, IFRAME_BOT, {
          patientId: 'pat-1',
          organizationId: 'org-1',
          onPatientSyncSuccess,
          onIframeSuccess,
        }),
      { wrapper: wrapper(medplum) }
    );

    await waitFor(() => expect(result.current).toBe('https://vendor.example/chart'));
    expect(executeBot).toHaveBeenNthCalledWith(1, SYNC_BOT, { patientId: 'pat-1', organizationId: 'org-1' });
    expect(executeBot).toHaveBeenNthCalledWith(2, IFRAME_BOT, { patientId: 'pat-1', organizationId: 'org-1' });
    expect(onPatientSyncSuccess).toHaveBeenCalledTimes(1);
    expect(onIframeSuccess).toHaveBeenCalledWith('https://vendor.example/chart');
  });

  test('skips patient sync when no patientId is provided', async () => {
    const medplum = new MockClient();
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({ url: 'https://vendor.example/chart' });

    const { result } = renderHook(() => useMedicationIFrame(SYNC_BOT, IFRAME_BOT, {}), { wrapper: wrapper(medplum) });

    await waitFor(() => expect(result.current).toBe('https://vendor.example/chart'));
    expect(executeBot).toHaveBeenCalledTimes(1);
    expect(executeBot).toHaveBeenCalledWith(IFRAME_BOT, { patientId: undefined, organizationId: undefined });
  });

  test('invokes onError when a bot execution fails', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('bot boom'));
    const onError = vi.fn();

    renderHook(() => useMedicationIFrame(SYNC_BOT, IFRAME_BOT, { patientId: 'pat-1', onError }), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
  });
});
