// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { vi } from 'vitest';
import { SCRIPTSURE_IFRAME_BOT, SCRIPTSURE_PATIENT_SYNC_BOT } from './common';
import type { ScriptSureIFrameOptions } from './useScriptSureIFrame';
import { useScriptSureIFrame } from './useScriptSureIFrame';

function TestComponent({ options }: { options: ScriptSureIFrameOptions }): JSX.Element {
  const iframeUrl = useScriptSureIFrame(options);
  return <div>URL: {iframeUrl || 'loading...'}</div>;
}

describe('useScriptSureIFrame', () => {
  const mockIframeUrl = 'https://scriptsure.example.com/chart/123/prescriptions?sessiontoken=tok';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('successfully initializes and shows iframe URL', async () => {
    const medplum = new MockClient();
    const onPatientSyncSuccess = vi.fn();
    const onIframeSuccess = vi.fn();

    medplum.executeBot = vi
      .fn()
      .mockResolvedValueOnce(allOk)
      .mockResolvedValueOnce({ url: mockIframeUrl });

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent
            options={{
              patientId: '123',
              onPatientSyncSuccess,
              onIframeSuccess,
            }}
          />
        </MedplumProvider>
      );
    });

    expect(medplum.executeBot).toHaveBeenCalledTimes(2);
    expect(medplum.executeBot).toHaveBeenNthCalledWith(1, SCRIPTSURE_PATIENT_SYNC_BOT, { patientId: '123' });
    expect(medplum.executeBot).toHaveBeenNthCalledWith(2, SCRIPTSURE_IFRAME_BOT, { patientId: '123' });

    expect(onPatientSyncSuccess).toHaveBeenCalled();
    expect(onIframeSuccess).toHaveBeenCalledWith(mockIframeUrl);

    expect(screen.getByText(`URL: ${mockIframeUrl}`)).toBeDefined();
  });

  test('handles error during bot execution', async () => {
    const medplum = new MockClient();
    const onError = vi.fn();
    const mockError = new Error('ScriptSure sync failed');

    medplum.executeBot = vi.fn().mockRejectedValueOnce(mockError);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent
            options={{
              patientId: '123',
              onError,
            }}
          />
        </MedplumProvider>
      );
    });

    expect(onError).toHaveBeenCalledWith(mockError);
  });

  test('skips patient sync when no patientId provided', async () => {
    const medplum = new MockClient();
    const onPatientSyncSuccess = vi.fn();

    medplum.executeBot = vi.fn().mockResolvedValueOnce({ url: mockIframeUrl });

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent
            options={{
              onPatientSyncSuccess,
            }}
          />
        </MedplumProvider>
      );
    });

    expect(medplum.executeBot).toHaveBeenCalledTimes(1);
    expect(medplum.executeBot).toHaveBeenCalledWith(SCRIPTSURE_IFRAME_BOT, { patientId: undefined });
    expect(onPatientSyncSuccess).not.toHaveBeenCalled();
  });
});
