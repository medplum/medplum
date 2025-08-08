// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import { JSX } from 'react';
import { vi } from 'vitest';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_SYNC_BOT } from './common';
import { DoseSpotIFrameOptions, useDoseSpotIFrame } from './useDoseSpotIFrame';

function TestComponent({ options }: { options: DoseSpotIFrameOptions }): JSX.Element {
  const iframeUrl = useDoseSpotIFrame(options);
  return <div>URL: {iframeUrl || 'loading...'}</div>;
}

describe('useDoseSpotIFrame', () => {
  const mockIframeUrl = 'https://dosespot.example.com/iframe/123';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('successfully initializes and shows iframe URL', async () => {
    const medplum = new MockClient();
    const onPatientSyncSuccess = vi.fn();
    const onIframeSuccess = vi.fn();

    // Mock the necessary medplum methods
    medplum.executeBot = vi
      .fn()
      // First call for patient sync
      .mockResolvedValueOnce(allOk)
      // Second call for iframe URL
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

    // Verify that both bots were executed in the correct order
    expect(medplum.executeBot).toHaveBeenCalledTimes(2);
    expect(medplum.executeBot).toHaveBeenNthCalledWith(1, DOSESPOT_PATIENT_SYNC_BOT, { patientId: '123' });
    expect(medplum.executeBot).toHaveBeenNthCalledWith(2, DOSESPOT_IFRAME_BOT, { patientId: '123' });

    // Verify callbacks were called
    expect(onPatientSyncSuccess).toHaveBeenCalled();
    expect(onIframeSuccess).toHaveBeenCalledWith(mockIframeUrl);

    // Verify final URL is displayed
    expect(screen.getByText(`URL: ${mockIframeUrl}`)).toBeDefined();
  });

  test('handles error', async () => {
    const medplum = new MockClient();
    const onError = vi.fn();
    const mockError = new Error('Sync failed');

    medplum.executeBot = vi
      .fn()
      .mockRejectedValueOnce(mockError) // Patient sync fails
      .mockResolvedValueOnce({ url: mockIframeUrl }); // Iframe URL succeeds

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
});
