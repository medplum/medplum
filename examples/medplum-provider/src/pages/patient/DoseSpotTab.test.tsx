// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { DoseSpotTab } from './DoseSpotTab';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';

// Mock useDoseSpotIFrame
vi.mock('@medplum/dosespot-react', () => ({
  useDoseSpotIFrame: vi.fn(() => 'https://dosespot.example.com/iframe'),
  DOSESPOT_MEDICATION_HISTORY_BOT: { reference: 'Bot/med-history' },
  DOSESPOT_PATIENT_SYNC_BOT: { reference: 'Bot/patient-sync' },
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT: { reference: 'Bot/prescriptions-sync' },
}));

describe('DoseSpotTab', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/dosespot" element={<DoseSpotTab />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders DoseSpotAdvancedOptions when patientId is present', async () => {
    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    await waitFor(() => {
      expect(screen.getByText('Advanced Options')).toBeInTheDocument();
    });
  });

  test('Renders iframe when iframeUrl is available', async () => {
    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#dosespot-iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://dosespot.example.com/iframe');
    });
  });

  test('Does not render iframe when iframeUrl is undefined', async () => {
    vi.mocked(useDoseSpotIFrame).mockReturnValue(undefined);

    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#dosespot-iframe');
      expect(iframe).not.toBeInTheDocument();
    });
  });

  test('Calls onPatientSyncSuccess callback and shows notification', async () => {
    let capturedOptions: any = {};

    vi.mocked(useDoseSpotIFrame).mockImplementation((options) => {
      capturedOptions = options;
      return 'https://dosespot.example.com/iframe';
    });

    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    // Simulate the onPatientSyncSuccess callback being called
    await act(async () => {
      capturedOptions.onPatientSyncSuccess?.();
    });

    await waitFor(() => {
      expect(screen.getByText('Patient sync success')).toBeInTheDocument();
    });
  });

  test('Calls onIframeSuccess callback and shows notification', async () => {
    let capturedOptions: any = {};

    vi.mocked(useDoseSpotIFrame).mockImplementation((options) => {
      capturedOptions = options;
      return 'https://dosespot.example.com/iframe';
    });

    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    // Simulate the onIframeSuccess callback being called
    await act(async () => {
      capturedOptions.onIframeSuccess?.();
    });

    await waitFor(() => {
      expect(screen.getByText('DoseSpot iframe success')).toBeInTheDocument();
    });
  });

  test('Calls onError callback and shows error notification', async () => {
    let capturedOptions: any = {};

    vi.mocked(useDoseSpotIFrame).mockImplementation((options) => {
      capturedOptions = options;
      return 'https://dosespot.example.com/iframe';
    });

    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    // Simulate the onError callback being called
    await act(async () => {
      capturedOptions.onError?.(new Error('DoseSpot connection failed'));
    });

    await waitFor(() => {
      expect(screen.getByText(/DoseSpot connection failed/i)).toBeInTheDocument();
    });
  });

  test('Passes correct patientId to useDoseSpotIFrame', async () => {
    vi.mocked(useDoseSpotIFrame).mockReturnValue('https://dosespot.example.com/iframe');

    setup(`/Patient/custom-patient-id/dosespot`);

    expect(useDoseSpotIFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'custom-patient-id',
      })
    );
  });

  test('Iframe has correct attributes', async () => {
    vi.mocked(useDoseSpotIFrame).mockReturnValue('https://dosespot.example.com/iframe');

    setup(`/Patient/${HomerSimpson.id}/dosespot`);

    await waitFor(() => {
      const iframe = document.querySelector('iframe#dosespot-iframe') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.name).toBe('dosespot-iframe');
      expect(iframe.id).toBe('dosespot-iframe');
      // Check basic styling is applied
      expect(iframe.style.minHeight).toBe('calc(100vh)');
    });
  });
});
