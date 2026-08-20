// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { DoseSpotIFrameOptions, DoseSpotSelfEnrollmentResult } from '@medplum/dosespot-react';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '../../test-utils/render';
import { DoseSpotNotificationsPage } from './DoseSpotNotificationsPage';

// Mock useDoseSpotIFrame
vi.mock('@medplum/dosespot-react', async () => {
  return {
    useDoseSpotIFrame: vi.fn(() => 'https://dosespot.example.com/iframe'),
    DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM: 'http://dosespot.com/clinic-favorite-id',
    useDoseSpotClinicFormulary: vi.fn(() => ({
      state: {},
      saveFavoriteMedication: vi.fn(),
      searchMedications: vi.fn(),
      setSelectedMedicationDirections: vi.fn(),
      setSelectedMedication: vi.fn(),
      clear: vi.fn(),
    })),
  };
});

const iframeUrl = 'https://dosespot.example.com/iframe';

const enrollmentResult: DoseSpotSelfEnrollmentResult = {
  status: 'created',
  doseSpotClinicianId: 1234,
  registrationStatus: 'pending',
  epcsEnabled: false,
  nextSteps: ['Complete identity proofing', 'Enable EPCS'],
};

describe('DoseSpotNotificationsPage', () => {
  beforeEach(() => {
    vi.mocked(useDoseSpotIFrame).mockReturnValue(iframeUrl);
  });

  async function setup(): Promise<void> {
    const medplum = new MockClient();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={['/dosespot']}>
            <Notifications />
            <DoseSpotNotificationsPage />
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  /**
   * Reads the options the page passed to the mocked hook.
   * @returns The captured `useDoseSpotIFrame` options.
   */
  function capturedOptions(): DoseSpotIFrameOptions {
    return vi.mocked(useDoseSpotIFrame).mock.calls[0][0];
  }

  test('Renders iframe', async () => {
    await setup();
    await waitFor(() => {
      const iframe = screen.getByTitle<HTMLIFrameElement>('dosespot-notifications-iframe');
      expect(iframe).toBeDefined();
      expect(iframe.src).toBe(iframeUrl);
    });
  });

  test('Does not render iframe when URL is undefined', async () => {
    vi.mocked(useDoseSpotIFrame).mockReturnValue(undefined);
    await setup();
    const iframe = screen.queryByTitle('dosespot-notifications-iframe');
    expect(iframe).toBeNull();
  });

  test('Calls useDoseSpotIFrame without patientId', async () => {
    await setup();
    expect(useDoseSpotIFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        onIframeSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
    expect(useDoseSpotIFrame).toHaveBeenCalledWith(
      expect.not.objectContaining({
        patientId: expect.anything(),
      })
    );
  });

  test('Opts into self-enrollment', async () => {
    await setup();
    expect(capturedOptions().selfEnroll).toBe(true);
  });

  test('Shows the first enrollment next step as a notification', async () => {
    await setup();

    await act(async () => {
      capturedOptions().onSelfEnrollSuccess?.(enrollmentResult);
    });

    expect(await screen.findByText('DoseSpot Enrollment')).toBeInTheDocument();
    expect(screen.getByText('Complete identity proofing')).toBeInTheDocument();
  });

  test('Falls back to a generic message when enrollment returns no next steps', async () => {
    await setup();

    await act(async () => {
      capturedOptions().onSelfEnrollSuccess?.({ ...enrollmentResult, nextSteps: [] });
    });

    expect(await screen.findByText('Enrollment in progress...')).toBeInTheDocument();
  });

  test('Shows a success notification when the iframe connects', async () => {
    await setup();

    await act(async () => {
      capturedOptions().onIframeSuccess?.(iframeUrl);
    });

    expect(await screen.findByText('Successfully connected to DoseSpot')).toBeInTheDocument();
  });

  test('Shows an error notification when the hook reports an error', async () => {
    await setup();

    await act(async () => {
      capturedOptions().onError?.(new Error('DoseSpot connection failed'));
    });

    expect(await screen.findByText('DoseSpot connection failed')).toBeInTheDocument();
  });
});
