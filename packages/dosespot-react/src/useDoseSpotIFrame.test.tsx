// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { vi } from 'vitest';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_SYNC_BOT, DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT } from './common';
import type { DoseSpotIFrameOptions } from './useDoseSpotIFrame';
import { useDoseSpotIFrame } from './useDoseSpotIFrame';

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

  test('selfEnroll: true with no existing identifier runs self-enroll bot first', async () => {
    const medplum = new MockClient();
    const onSelfEnrollSuccess = vi.fn();
    const onIframeSuccess = vi.fn();

    const mockEnrollResult = {
      status: 'created',
      doseSpotClinicianId: 999,
      registrationStatus: 'Pending',
      epcsEnabled: false,
      nextSteps: ['Sign agreement'],
    };

    medplum.executeBot = vi
      .fn()
      .mockResolvedValueOnce(mockEnrollResult) // self-enroll bot
      .mockResolvedValueOnce({ url: mockIframeUrl }); // iframe bot (no patientId, so no sync)

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent
            options={{
              selfEnroll: true,
              onSelfEnrollSuccess,
              onIframeSuccess,
            }}
          />
        </MedplumProvider>
      );
    });

    expect(medplum.executeBot).toHaveBeenCalledTimes(2);
    expect(medplum.executeBot).toHaveBeenNthCalledWith(1, DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT, {});
    expect(medplum.executeBot).toHaveBeenNthCalledWith(2, DOSESPOT_IFRAME_BOT, { patientId: undefined });
    expect(onSelfEnrollSuccess).toHaveBeenCalledWith(mockEnrollResult);
    expect(onIframeSuccess).toHaveBeenCalledWith(mockIframeUrl);
  });

  test('selfEnroll: true with existing identifier skips self-enroll bot', async () => {
    const medplum = new MockClient();
    const onSelfEnrollSuccess = vi.fn();
    const onIframeSuccess = vi.fn();

    // Simulate an existing DoseSpot identifier on the membership
    const originalGetProjectMembership = medplum.getProjectMembership.bind(medplum);
    medplum.getProjectMembership = () => {
      const membership = originalGetProjectMembership();
      return {
        ...membership,
        identifier: [{ system: 'https://my.dosespot.com/webapi/v2/', value: '888' }],
      } as any;
    };

    medplum.executeBot = vi.fn().mockResolvedValueOnce({ url: mockIframeUrl });

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent
            options={{
              selfEnroll: true,
              onSelfEnrollSuccess,
              onIframeSuccess,
            }}
          />
        </MedplumProvider>
      );
    });

    // Only iframe bot should be called (no self-enroll, no patient sync)
    expect(medplum.executeBot).toHaveBeenCalledTimes(1);
    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_IFRAME_BOT, { patientId: undefined });
    expect(onSelfEnrollSuccess).not.toHaveBeenCalled();
    expect(onIframeSuccess).toHaveBeenCalledWith(mockIframeUrl);
  });

  test('selfEnroll: false (default) does not run self-enroll bot', async () => {
    const medplum = new MockClient();
    const onIframeSuccess = vi.fn();

    medplum.executeBot = vi.fn().mockResolvedValueOnce({ url: mockIframeUrl });

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent
            options={{
              onIframeSuccess,
            }}
          />
        </MedplumProvider>
      );
    });

    expect(medplum.executeBot).toHaveBeenCalledTimes(1);
    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_IFRAME_BOT, { patientId: undefined });
    expect(onIframeSuccess).toHaveBeenCalledWith(mockIframeUrl);
  });
});
